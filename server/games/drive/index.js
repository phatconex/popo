// Lái Mò — game 2 người: một người lái nhưng không thấy đường, người kia thấy bản đồ và chỉ đường.
// Hết mỗi màn hai người đổi vai. Cả hai cùng một đội, cùng ăn điểm.
const { THEMES, THEME_IDS, genTrack } = require('./track');

const meta = {
  id: 'drive', name: 'Lái Mò', desc: 'Một người lái mà không thấy đường, người kia chỉ đường', tag: '2 người', min: 2, max: 2,
  settings: [
    { key: 'map', label: 'Bản đồ', def: 'random', options: [{ v: 'random', label: 'Ngẫu nhiên' }, ...THEME_IDS.map(id => ({ v: id, label: THEMES[id].name }))] },
    { key: 'levels', label: 'Số màn', def: 4, options: [{ v: 2, label: '2' }, { v: 4, label: '4' }, { v: 6, label: '6' }] },
    { key: 'delay', label: 'Tín hiệu trễ', def: 0, options: [{ v: 0, label: 'Không' }, { v: .5, label: '0,5 giây' }, { v: 1, label: '1 giây' }] },
  ],
};

const HEARTS = 4;
const ACC = 200, BRAKE = 460, VMAX = 230, VMAX_OFF = 105, VREV = -90, TURN = 2.5;
const GRIP = 9, GRIP_SLICK = 1.2;
const LOST = 230;           // ra khỏi mép đường quá xa thì bị đưa về đường
const BOARD_T = 0.9, BOARD_R = 80, BOARD_V = 40;
const INVULN = 1.3, READY_T = 3, RESULT_T = 7, FINAL_T = 12;
const SIGNALS = 8, SIG_GAP = 0.15;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = (x, y) => Math.sqrt(x * x + y * y);

class Drive {
  constructor(api) {
    this.api = api;
    this.levels = api.settings.levels || 4;
    this.delay = +api.settings.delay || 0;
    this.team = api.players().filter(p => p.connected).slice(0, 2).map(p => p.id);
    this.lv = -1; this.total = 0; this.results = []; this.lastTheme = null;
  }

  start() { this.nextLevel(); }

  nextLevel() {
    this.lv++;
    let theme = this.api.settings.map;
    if (!THEMES[theme]) { const pool = THEME_IDS.filter(t => t !== this.lastTheme); theme = pool[Math.random() * pool.length | 0]; }
    this.lastTheme = theme;
    const m = this.map = genTrack(theme, Math.min(this.lv, 5));
    this.driver = this.team[this.lv % 2];
    this.nav = this.team[(this.lv + 1) % 2];
    const p0 = m.pts[0], p1 = m.pts[3];
    this.car = { x: p0[0], y: p0[1], a: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), v: 0, vx: 0, vy: 0, ci: 0, steer: 0, gas: 0, brake: 0, inv: 0, off: 0, slick: 0 };
    this.hp = HEARTS; this.coins = 0; this.picked = 0;
    this.stops = m.stops.map(() => 0);   // 0 chờ, 0..1 đang lên xe, 2 đã đón
    this.knocked = new Set(); this.got = new Set();
    this.crossState = m.crossers.map(() => ({ flee: 0 }));
    this.queue = []; this.sigAt = 0; this.sigId = 0;
    this.phase = 'ready'; this.time = READY_T; this.t = 0;
    for (const p of this.api.players()) this.sendInit(p);
  }

  roleOf(p) { return p.id === this.driver ? 'driver' : p.id === this.nav ? 'nav' : 'watch'; }
  sendInit(p) {
    this.api.send(p, { t: 'init', map: this.map, role: this.roleOf(p), driver: this.driver, nav: this.nav, lv: this.lv, levels: this.levels, total: this.total, hearts: HEARTS, ph: this.phase });
  }

  onMsg(p, d) {
    const c = this.car;
    if (d.t === 'in' && p.id === this.driver) {
      c.steer = clamp(+d.s || 0, -1, 1); c.gas = d.g ? 1 : 0; c.brake = d.b ? 1 : 0; c.rev = d.r ? 1 : 0;
    } else if (d.t === 'sig' && p.id === this.nav && this.phase !== 'result') {
      const k = d.k | 0;
      if (k < 0 || k >= SIGNALS || this.t - this.sigAt < SIG_GAP) return;
      this.sigAt = this.t;
      const id = ++this.sigId;
      this.queue.push({ k, id, at: this.t + this.delay });
      this.api.send(p, { t: 'sent', k, id });
    }
  }

  crosserPos(i) {
    const cr = this.map.crossers[i], st = this.crossState[i], m = this.map;
    const amp = m.rw + 46, per = (amp * 4) / cr.spd + 3; // đi qua lại, nghỉ 1,5 giây mỗi bên
    const tt = (this.t + cr.ph) % per, half = per / 2, walk = half - 1.5;
    let u, dirn;
    if (tt < walk) { u = -1 + 2 * tt / walk; dirn = 1; } else if (tt < half) { u = 1; dirn = 0; }
    else if (tt < half + walk) { u = 1 - 2 * (tt - half) / walk; dirn = -1; } else { u = -1; dirn = 0; }
    const off = u * amp + (st.flee > 0 ? Math.sign(u || 1) * (1 - st.flee) * 60 : 0);
    const [bx, by] = m.pts[cr.i];
    return { x: bx + Math.cos(cr.ang) * off, y: by + Math.sin(cr.ang) * off, dirn, onRoad: Math.abs(off) < m.rw + 10 };
  }

  nearestIdx(x, y, from) {
    const pts = this.map.pts;
    let best = from, bd = Infinity;
    const lo = from < 0 ? 0 : Math.max(0, from - 30), hi = from < 0 ? pts.length - 1 : Math.min(pts.length - 1, from + 40);
    for (let i = lo; i <= hi; i++) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  }

  hurt(why) {
    const c = this.car;
    if (c.inv > 0 || this.phase !== 'drive') return;
    this.hp--; c.inv = INVULN;
    this.api.bcast({ t: 'fx', k: 'hurt', why, x: Math.round(c.x), y: Math.round(c.y) });
    if (this.hp <= 0) this.endLevel(false);
  }

  tick(dt) {
    this.t += dt;
    // màn chuẩn bị/kết quả: đếm ngược; lúc lái: đếm xuôi (không giới hạn thời gian)
    this.time += this.phase === 'drive' ? dt : -dt;
    const c = this.car, m = this.map;

    for (const q of this.queue) if (q.at <= this.t) {
      const drv = this.api.players().find(p => p.id === this.driver);
      if (drv) this.api.send(drv, { t: 'sig', k: q.k, id: q.id });
      q.done = 1;
    }
    this.queue = this.queue.filter(q => !q.done);
    for (const s of this.crossState) if (s.flee > 0) s.flee = Math.max(0, s.flee - dt / 2);

    if (this.phase === 'ready') { if (this.time <= 0) { this.phase = 'drive'; this.time = 0; } }
    else if (this.phase === 'drive') this.physics(dt);
    else if (this.phase === 'result' && this.time <= 0) {
      if (this.lv + 1 >= this.levels) return this.api.end(this.total > 0 ? this.team : []);
      this.nextLevel();
      return;
    }
    if (this.api && this.map === m) this.broadcast();
  }

  physics(dt) {
    const c = this.car, m = this.map;
    c.inv = Math.max(0, c.inv - dt);
    const near = this.nearestIdx(c.x, c.y, c.ci);
    c.ci = near.i;
    const off = Math.max(0, near.d - m.rw);
    c.off = off;
    c.slick = m.slicks.some(([sx, sy, rx, ry]) => ((c.x - sx) / rx) ** 2 + ((c.y - sy) / ry) ** 2 < 1) ? 1 : 0;
    const snowy = m.theme === 'snow';

    // tăng tốc / phanh
    const vmax = off > 0 ? VMAX_OFF : VMAX;
    if (c.brake) c.v = c.v > 0 ? Math.max(0, c.v - BRAKE * dt) : Math.min(0, c.v + BRAKE * dt);
    else if (c.rev && !c.gas) c.v = c.v > 0 ? Math.max(0, c.v - BRAKE * dt) : Math.max(VREV, c.v - ACC * .6 * dt);
    else if (c.gas) c.v = c.v < 0 ? Math.min(0, c.v + BRAKE * dt) : Math.min(vmax, c.v + ACC * dt);
    else c.v *= Math.pow(c.slick ? .8 : .45, dt);
    if (c.v > vmax) c.v = Math.max(vmax, c.v - BRAKE * dt);
    if (Math.abs(c.v) < 2 && !c.gas && !c.rev) c.v = 0;

    c.a += c.steer * TURN * dt * clamp(Math.abs(c.v) / 90, 0, 1) * Math.sign(c.v) * (c.slick ? .6 : 1);
    const grip = c.slick ? (snowy ? GRIP_SLICK * .6 : GRIP_SLICK) : GRIP;
    const dx = Math.cos(c.a) * c.v, dy = Math.sin(c.a) * c.v;
    const k = Math.min(1, grip * dt);
    c.vx += (dx - c.vx) * k; c.vy += (dy - c.vy) * k;
    c.x = clamp(c.x + c.vx * dt, 20, m.W - 20); c.y = clamp(c.y + c.vy * dt, 20, m.H - 20);

    // lạc khỏi đường quá xa: đưa về đường
    if (off > LOST) {
      const g = this.nearestIdx(c.x, c.y, -1), p = m.pts[g.i], q = m.pts[Math.min(m.pts.length - 1, g.i + 2)];
      c.ci = g.i; c.x = p[0]; c.y = p[1]; c.a = Math.atan2(q[1] - p[1], q[0] - p[0]); c.v = c.vx = c.vy = 0;
      this.hurt('lost');
      if (this.phase !== 'drive') return;
    }
    // va chạm cọc
    m.cones.forEach(([x, y], i) => {
      if (this.knocked.has(i) || hyp(c.x - x, c.y - y) > 24) return;
      this.knocked.add(i); c.v *= .45;
      this.hurt('cone');
    });
    // va chạm thú băng qua đường
    m.crossers.forEach((cr, i) => {
      const p = this.crosserPos(i);
      if (!p.onRoad || hyp(c.x - p.x, c.y - (p.y - 8)) > 30 || Math.abs(c.v) < 30) return;
      if (c.inv > 0) return;
      this.crossState[i].flee = 1;
      c.v = -c.v * .3; c.vx *= -.3; c.vy *= -.3;
      this.hurt('animal');
    });
    if (this.phase !== 'drive') return;
    // xu
    m.coins.forEach(([x, y], i) => {
      if (this.got.has(i) || hyp(c.x - x, c.y - y) > 26) return;
      this.got.add(i); this.coins++;
    });
    // đón khách: dừng gần trạm đủ lâu
    m.stops.forEach((s, i) => {
      if (this.stops[i] >= 2) return;
      if (hyp(c.x - s.x, c.y - s.y) < BOARD_R && Math.abs(c.v) < BOARD_V) {
        this.stops[i] = Math.min(1, this.stops[i] + dt / BOARD_T);
        if (this.stops[i] >= 1) { this.stops[i] = 2; this.picked++; this.api.bcast({ t: 'fx', k: 'pick', i, kind: s.kind }); }
      } else this.stops[i] = Math.max(0, this.stops[i] - dt / BOARD_T / 2); // rời trạm thì tụt dần, không mất hết
    });
    // về đích
    if (c.ci >= m.pts.length - 3 && off === 0) this.endLevel(true);
  }

  endLevel(done) {
    if (this.phase !== 'drive') return;
    const m = this.map, secs = Math.round(this.time);
    const all = this.picked === m.stops.length;
    const score = this.picked * 100 + this.coins * 10 + (done ? 100 + this.hp * 30 : 0);
    const stars = done ? (all ? 3 : this.picked * 2 >= m.stops.length ? 2 : 1) : (this.picked > 0 ? 1 : 0);
    this.total += score;
    const r = { lv: this.lv, theme: m.theme, done, why: done ? 'finish' : 'crash', picked: this.picked, stops: m.stops.length, coins: this.coins, hp: this.hp, secs, score, stars, driver: this.driver };
    this.results.push(r);
    this.phase = 'result';
    const last = this.lv + 1 >= this.levels;
    this.time = last ? FINAL_T : RESULT_T;
    this.api.bcast({ t: 'result', ...r, total: this.total, last, wait: this.time, all: this.results });
  }

  broadcast() {
    const c = this.car, m = this.map;
    // "đèn va chạm" cho tài xế: gần mép đường hoặc có vật cản phía trước
    let danger = clamp(c.off > 0 ? .55 + c.off / LOST * .45 : 0, 0, 1);
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const look = (x, y) => {
      const rx = x - c.x, ry = y - c.y, ahead = rx * fx + ry * fy, side = Math.abs(-rx * fy + ry * fx);
      if (ahead > 0 && ahead < 190 && side < 34) danger = Math.max(danger, 1 - ahead / 220);
    };
    m.cones.forEach(([x, y], i) => { if (!this.knocked.has(i)) look(x, y); });
    const cr = m.crossers.map((_, i) => { const p = this.crosserPos(i); if (p.onRoad) look(p.x, p.y); return [Math.round(p.x), Math.round(p.y), p.dirn, this.crossState[i].flee > 0 ? 1 : 0]; });
    const pts = m.pts, near = this.nearestIdx(c.x, c.y, c.ci);
    if (near.d > m.rw * .7 && c.off === 0) danger = Math.max(danger, (near.d / m.rw - .7) / .3 * .5);
    const msg = {
      t: 's', ph: this.phase, tm: +this.time.toFixed(1),
      car: [Math.round(c.x), Math.round(c.y), +c.a.toFixed(3), Math.round(c.v)],
      st: +c.steer.toFixed(2), g: c.gas, b: c.brake, off: c.off > 0 ? 1 : 0, sl: c.slick, inv: c.inv > 0 ? 1 : 0,
      hp: this.hp, pk: this.picked, co: this.coins, prog: +(c.ci / (pts.length - 1)).toFixed(3), dg: +danger.toFixed(2),
      stops: this.stops.map(v => +v.toFixed(2)), kn: [...this.knocked], got: [...this.got], cr,
    };
    this.api.bcast(msg);
  }

  onRejoin(p) { this.sendInit(p); }
  onDisconnect(p) { if (p.id === this.driver) { this.car.steer = 0; this.car.gas = 0; this.car.brake = 0; this.car.rev = 0; } }
  onLeave(p) { if (this.team.includes(p.id)) this.api.end([]); }
}

module.exports = { meta, create: api => new Drive(api) };
