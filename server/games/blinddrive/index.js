// Blind Drive - game module: team balancing, scoring, and the room's race flow.
const BD = require('../../../public/games/blinddrive3d/shared.js');
const { genTrack } = require('./track');
const { CAR } = BD;

// Timings (BD_FAST=1 shortens them for bot runs). Distances in metres, speeds in m/s.
const FAST = process.env.BD_FAST === '1';
const READY_T = FAST ? .5 : 3, COUNT_T = FAST ? .5 : 3, AFTER_FIRST = FAST ? 5 : 20, LEVEL_CAP = FAST ? 60 : 240;
const RESULT_T = FAST ? 1 : 7, FINAL_T = FAST ? 2 : 12, TRACK_OPTS = FAST ? { len: 60 } : {};
const SPIN_T = 2, INVULN = 1.3;
const BOARD_T = .8, BOARD_R = 2.2, BOARD_V = 1.2;
const COIN_R = .9, HIT_R = .9, HIT_V = .5, OFF_LIMIT = 6;
const SWAP_T = 5, STALL_T = 1, SIG_GAP = .15;
const START_GAP = 1.2; // sideways gap between cars on the start line

const PLACE_PTS = [300, 200, 120, 60];
const PTS_PICKED = 100, PTS_COIN = 10;

const meta = {
  id: 'blinddrive',
  name: 'Blind Drive',
  desc: 'One drives blind, one calls the turns',
  tag: '2-8 players · teams',
  min: 2, max: 8,
  teams: { count: 4, max: 3, names: ['Red', 'Blue', 'Green', 'Yellow'] },
  settings: [
    { key: 'map', label: 'Map', def: 'random', options: [{ v: 'random', label: 'Random' }, { v: 'country', label: 'Country Road' }, { v: 'snow', label: 'Snowy Pass' }, { v: 'beach', label: 'Beach Town' }, { v: 'night', label: 'Night City' }] },
    { key: 'levels', label: 'Levels', def: 4, options: [{ v: 2, label: '2' }, { v: 4, label: '4' }, { v: 6, label: '6' }] },
    { key: 'delay', label: 'Signal delay', def: 0, options: [{ v: 0, label: 'None' }, { v: .5, label: '0.5 s' }, { v: 1, label: '1 s' }] },
  ],
};

// Split players into `count` groups of 2..max. Players are in join order; result ids are in join order.
function balance(players, count = 4, max = 3) {
  const order = new Map(players.map((p, i) => [p.id, i]));
  const groups = Array.from({ length: count }, () => []);
  const free = [];
  for (const p of players) {
    const t = p.team;
    if (Number.isInteger(t) && t >= 0 && t < count && groups[t].length < max) groups[t].push(p.id);
    else free.push(p.id);
  }
  // place unassigned players
  for (let i = 0; i < free.length; i++) {
    const id = free[i], left = free.length - i;
    let g = groups.find(x => x.length === 1);
    if (!g && left >= 2) g = groups.find(x => x.length === 0);
    if (!g) {
      const open = groups.filter(x => x.length > 0 && x.length < max);
      if (open.length) g = open.reduce((a, b) => (b.length < a.length ? b : a));
    }
    if (!g) g = groups.find(x => x.length < max);
    g.push(id);
  }
  // fix singles
  const singles = groups.filter(x => x.length === 1);
  for (let i = 0; i + 1 < singles.length; i += 2) singles[i].push(singles[i + 1].pop());
  if (singles.length % 2) {
    const s = singles[singles.length - 1];
    const two = groups.find(x => x.length === 2);
    if (two) two.push(s.pop());
    else {
      const three = groups.find(x => x.length === 3);
      if (three) {
        let li = 0;
        three.forEach((id, k) => { if (order.get(id) > order.get(three[li])) li = k; });
        s.push(three.splice(li, 1)[0]);
      }
    }
  }
  for (const g of groups) g.sort((a, b) => order.get(a) - order.get(b));
  return groups;
}

// Points for one level: finishing place (1-based or null), picked-up passengers, coins.
function score({ place, picked, coins }) {
  return (PLACE_PTS[place - 1] || 0) + picked * PTS_PICKED + coins * PTS_COIN;
}

// Sort best first; equal total and firsts share the same rank (1, 1, 3).
function rank(rows) {
  const s = rows.slice().sort((a, b) => b.total - a.total || b.firsts - a.firsts || a.team - b.team);
  let r = 0;
  return s.map((row, i) => {
    if (i === 0 || row.total !== s[i - 1].total || row.firsts !== s[i - 1].firsts) r = i + 1;
    return { ...row, rank: r };
  });
}

const fin = v => typeof v === 'number' && Number.isFinite(v);
function validateMove(prev, next, now) {
  if (!next || typeof next !== 'object' || !fin(next.x) || !fin(next.z)) return false;
  if (!prev) return true;
  const dt = Math.max(.05, now - prev.t);
  return Math.hypot(next.x - prev.x, next.z - prev.z) <= CAR.VMAX * dt * 1.5 + .5;
}

const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const ceil0 = v => Math.max(0, Math.ceil(v - 1e-9));
const LIVE = ['ready', 'count', 'race'];

class BlindDrive {
  constructor(api) {
    this.api = api;
    this.teams = [];      // {id, name, members, driver, total, firsts, car, ...per-level state}
    this.level = 0;       // 1-based
    this.clock = 0;       // seconds since start
    this.ph = null;
    this.over = false;
    this.prevTheme = null;
    this.sigs = [];       // delayed signals {at, team, k, from}
    this.lastSig = new Map();
    this.snap = null;     // latest snapshot (re-sent on rejoin)
    this.board = null;    // latest level / final message (re-sent on rejoin)
  }

  // ---- helpers ----
  player(id) { return this.api.players().find(p => p.id === id); }
  online() { return new Set(this.api.players().filter(p => p.connected).map(p => p.id)); }
  teamOf(id) { return this.teams.find(t => t.members.includes(id)); }
  me(id) {
    const t = this.teamOf(id);
    if (!t) return { team: -1, role: 'nav' };
    return { team: t.id, role: t.members.length === 1 ? 'solo' : t.driver === id ? 'driver' : 'nav' };
  }
  sendDriver(t, d) { const p = this.player(t.driver); if (p) this.api.send(p, d); }
  fixMsg(c) { return { t: 'fix', x: r2(c.x), z: r2(c.z), a: r3(c.a), v: r2(c.v) }; }
  // first connected member in rotation order from index `from`; falls back to members[from]
  nextDriver(t, from) {
    const m = t.members, on = this.online();
    for (let j = 0; j < m.length; j++) { const id = m[(from + j) % m.length]; if (on.has(id)) return id; }
    return m[from % m.length];
  }
  setDriver(t, id) {
    t.driver = id; t.off = 0;
    if (this.ph === 'race') { t.car.t = this.clock; this.sendDriver(t, this.fixMsg(t.car)); }
    this.sendRoles();
  }
  sendRoles() {
    const teams = this.teams.map(t => ({ id: t.id, driver: t.driver, members: t.members.slice() }));
    for (const p of this.api.players()) this.api.send(p, { t: 'roles', teams, me: this.me(p.id) });
  }

  // ---- flow ----
  start() {
    const S = this.api.settings;
    this.levels = [2, 4, 6].includes(+S.levels) ? +S.levels : 4;
    this.delay = Math.max(0, Math.min(2, +S.delay || 0));
    const ps = this.api.players().filter(p => p.connected);
    const T = meta.teams, groups = balance(ps.map(p => ({ id: p.id, team: p.team })), T.count, T.max);
    this.teams = groups.map((members, id) => ({ id, name: T.names[id], members, driver: null, total: 0, firsts: 0 })).filter(t => t.members.length);
    this.newLevel();
  }

  newLevel() {
    this.level++;
    const L = this.level - 1;
    let theme = this.api.settings.map;
    if (!BD.THEMES[theme]) { const opts = Object.keys(BD.THEMES).filter(x => x !== this.prevTheme); theme = opts[Math.random() * opts.length | 0]; }
    this.prevTheme = theme;
    const tr = this.track = genTrack(theme, L, Math.random() * 2 ** 31 >>> 0, TRACK_OPTS);
    this.rings = tr.stops.map(st => BD.stopPoints(tr, st).ring);
    const [p0, p1] = tr.pts, a0 = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), n = this.teams.length;
    this.teams.forEach((t, k) => {
      const off = (k - (n - 1) / 2) * START_GAP; // along the right vector (-cos a, sin a)
      const x = r2(p1[0] - Math.cos(a0) * off), z = r2(p1[1] + Math.sin(a0) * off);
      Object.assign(t, {
        start: [x, z, r3(a0)], car: { x, z, a: a0, v: 0, g: 0, b: 0, t: 0 }, seen: 0, spin: 0, inv: 0, off: 0,
        prog: tr.stops.map(() => 0), got: tr.stops.map(() => false), taken: new Set(), picked: 0, coins: 0, place: null,
      });
      t.driver = this.nextDriver(t, L % t.members.length);
    });
    this.places = 0; this.firstAt = null; this.lt = 0; this.rt = 0;
    this.sigs = []; this.board = null;
    this.setPhase('ready', READY_T);
    this.crs = this.crossers();
    for (const p of this.api.players()) this.sendInit(p);
  }

  setPhase(ph, t) { this.ph = ph; this.left = t; }

  sendInit(p) {
    this.api.send(p, {
      t: 'init', track: this.track, theme: this.track.theme, level: this.level, levels: this.levels,
      teams: this.teams.map(t => ({ id: t.id, name: t.name, members: t.members.slice(), driver: t.driver, got: t.got.flatMap((g, k) => (g ? [k] : [])), taken: [...t.taken] })),
      start: this.teams.map(t => [t.id, ...t.start]), me: this.me(p.id), ph: this.ph, t0: r3(this.lt),
    });
  }

  next() {
    if (this.ph === 'ready') this.setPhase('count', COUNT_T);
    else if (this.ph === 'count') {
      this.setPhase('race', 0);
      for (const t of this.teams) { t.car.t = this.clock; t.seen = this.clock; }
    } else if (this.ph === 'result') {
      if (this.level < this.levels) return this.newLevel();
      this.setPhase('final', FINAL_T);
      const rows = rank(this.teams.map(t => ({ team: t.id, total: t.total, firsts: t.firsts })));
      this.board = { t: 'final', rows: rows.map(r => ({ ...r, members: this.teams.find(t => t.id === r.team).members.slice() })) };
      this.api.bcast(this.board);
    } else if (this.ph === 'final') {
      this.over = true;
      this.api.end(this.board.rows.filter(r => r.rank === 1 && r.total > 0).flatMap(r => r.members));
    }
  }

  endLevel() {
    const rows = this.teams.map(t => {
      const points = score(t);
      t.total += points;
      if (t.place === 1) t.firsts++;
      return { team: t.id, place: t.place, picked: t.picked, coins: t.coins, points, total: t.total };
    });
    this.board = { t: 'level', level: this.level, rows };
    this.api.bcast(this.board);
    this.setPhase('result', RESULT_T);
  }

  crossers() { return this.track.crossers.map(c => BD.crosserPos(this.track, c, this.lt)); }

  tick(dt) {
    if (this.over || !this.ph) return;
    if (this.online().size < 2) { this.over = true; return this.api.end([]); }
    dt = Math.min(.1, Math.max(0, +dt || 0));
    this.clock += dt; this.lt += dt;
    this.crs = this.crossers();
    if (LIVE.includes(this.ph)) this.checkDrivers(dt);
    this.flushSigs();
    if (this.ph === 'race') { this.rt += dt; this.race(dt); } else { this.left -= dt; if (this.left <= 1e-9) this.next(); }
    if (!this.over) this.broadcast();
  }

  // A driver offline for SWAP_T hands the wheel to the next connected teammate for the rest of the level.
  checkDrivers(dt) {
    const on = this.online();
    for (const t of this.teams) {
      if (on.has(t.driver)) { t.off = 0; continue; }
      t.off += dt;
      if (t.off < SWAP_T) continue;
      const id = this.nextDriver(t, t.members.indexOf(t.driver) + 1);
      if (on.has(id)) this.setDriver(t, id);
    }
  }

  flushSigs() {
    const due = this.sigs.filter(s => s.at <= this.clock + 1e-9);
    if (!due.length) return;
    this.sigs = this.sigs.filter(s => !due.includes(s));
    for (const s of due) if (this.teams.includes(s.team)) this.sendDriver(s.team, { t: 'sig', k: s.k, from: s.from });
  }

  race(dt) {
    const tr = this.track, done = [];
    for (const t of this.teams) {
      const c = t.car;
      if (t.spin > 0) {
        t.spin -= dt;
        if (t.spin <= 1e-9) { t.spin = 0; t.inv = INVULN; c.t = this.clock; t.seen = this.clock; }
        continue;
      }
      if (t.inv > 0) t.inv = Math.max(0, t.inv - dt);
      if (this.clock - t.seen >= STALL_T) c.v = 0;
      if (t.place) continue;
      const n = BD.nearestOnTrack(tr, c.x, c.z);
      if (!t.inv && (n.dist > OFF_LIMIT || this.crs.some(q => q.onRoad && Math.abs(c.v) > HIT_V && Math.hypot(q.x - c.x, q.z - c.z) <= HIT_R))) { this.spinOut(t, n.i); continue; }
      this.rings.forEach((r, k) => {
        if (t.got[k]) return;
        if (Math.hypot(c.x - r.x, c.z - r.z) <= BOARD_R && Math.abs(c.v) <= BOARD_V) t.prog[k] += dt;
        else t.prog[k] = Math.max(0, t.prog[k] - dt / 2);
        if (t.prog[k] >= BOARD_T - 1e-6) { t.got[k] = true; t.picked++; this.api.bcast({ t: 'fx', kind: 'pick', team: t.id, i: k }); }
      });
      tr.coins.forEach(([x, z], k) => {
        if (t.taken.has(k) || Math.hypot(c.x - x, c.z - z) > COIN_R) return;
        t.taken.add(k); t.coins++;
        this.api.bcast({ t: 'fx', kind: 'coin', team: t.id, i: k });
      });
      if (n.i >= tr.finishI && n.dist <= tr.rw + .6) done.push([t, n.i]);
    }
    done.sort((A, B) => B[1] - A[1] || A[0].id - B[0].id);
    for (const [t] of done) {
      t.place = ++this.places;
      if (this.firstAt === null) this.firstAt = this.rt;
      this.api.bcast({ t: 'fx', kind: 'finish', team: t.id, i: t.place });
    }
    const on = this.online(), active = this.teams.filter(t => t.members.some(id => on.has(id)));
    if (active.every(t => t.place) || (this.firstAt !== null && this.rt - this.firstAt >= AFTER_FIRST - 1e-9) || this.rt >= LEVEL_CAP - 1e-9) this.endLevel();
  }

  // Reset onto the centre line at index i, facing along the road; frozen for SPIN_T.
  spinOut(t, i) {
    const p = this.track.pts, j = Math.min(i, p.length - 2);
    Object.assign(t.car, { x: p[i][0], z: p[i][1], a: Math.atan2(p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]), v: 0, g: 0, b: 0 });
    t.spin = SPIN_T;
    this.sendDriver(t, this.fixMsg(t.car));
    this.api.bcast({ t: 'fx', kind: 'spin', team: t.id });
  }

  broadcast() {
    const tr = this.track;
    let tm, finLeft = null;
    if (this.ph !== 'race') tm = ceil0(this.left);
    else if (this.firstAt === null) tm = Math.floor(this.rt + 1e-9);
    else { finLeft = ceil0(this.firstAt + AFTER_FIRST - this.rt); tm = ceil0(Math.min(this.firstAt + AFTER_FIRST, LEVEL_CAP) - this.rt); }
    const cars = this.teams.map(t => {
      const c = t.car, grass = BD.nearestOnTrack(tr, c.x, c.z).dist > tr.rw;
      return [t.id, r2(c.x), r2(c.z), r3(c.a), r2(c.v), (t.spin > 0 ? 1 : 0) | (c.g ? 2 : 0) | (c.b ? 4 : 0) | (grass ? 8 : 0)];
    });
    const tp = this.teams.map(t => [t.id, t.picked, t.coins, t.place, r2(Math.min(1, Math.max(0, ...t.prog) / BOARD_T))]);
    this.snap = { t: 's', ph: this.ph, tm, fin: finLeft, cars, tp, cr: this.crs.map((q, i) => [i, r2(q.x), r2(q.z)]) };
    this.api.bcast(this.snap);
  }

  // ---- players ----
  onMsg(p, d) {
    if (this.over || !p || !d || typeof d !== 'object') return;
    const t = this.teamOf(p.id);
    if (!t) return;
    if (d.t === 'car') {
      if (this.ph !== 'race' || t.driver !== p.id || t.spin > 0) return;
      const { x, z, a, v } = d;
      if (![x, z, a, v].every(fin)) return;
      const c = t.car;
      if (!validateMove(c, { x, z }, this.clock)) return this.api.send(p, this.fixMsg(c));
      Object.assign(c, { x, z, a: Math.atan2(Math.sin(a), Math.cos(a)), v: Math.max(CAR.VREV, Math.min(CAR.VMAX, v)), g: d.g ? 1 : 0, b: d.b ? 1 : 0, t: this.clock });
      t.seen = this.clock;
    } else if (d.t === 'sig') {
      const k = d.k;
      if (!LIVE.includes(this.ph) || t.driver === p.id || !Number.isInteger(k) || k < 0 || k > 7) return;
      const last = this.lastSig.get(p.id);
      if (last !== undefined && this.clock - last < SIG_GAP - 1e-9) return;
      this.lastSig.set(p.id, this.clock);
      this.api.send(p, { t: 'sent', k });
      if (this.delay > 0) this.sigs.push({ at: this.clock + this.delay, team: t, k, from: p.id });
      else this.sendDriver(t, { t: 'sig', k, from: p.id });
    }
  }

  onRejoin(p) {
    if (this.over || !this.ph) return;
    this.sendInit(p);
    if (this.board) this.api.send(p, this.board);
    const t = this.teamOf(p.id);
    if (t && t.driver === p.id && this.ph === 'race') { t.car.t = this.clock; this.api.send(p, this.fixMsg(t.car)); }
    if (this.snap) this.api.send(p, this.snap);
  }

  onDisconnect(p) {
    const t = this.teamOf(p.id);
    if (t && t.driver === p.id) { t.car.g = 0; t.car.b = 0; }
  }

  onLeave(p) {
    const t = this.teamOf(p.id);
    if (!t || this.over) return;
    const idx = t.members.indexOf(p.id);
    t.members.splice(idx, 1);
    if (!t.members.length) { this.teams = this.teams.filter(x => x !== t); return this.sendRoles(); }
    if (t.driver === p.id) this.setDriver(t, this.nextDriver(t, idx % t.members.length));
    else this.sendRoles();
  }
}

module.exports = { meta, create: api => new BlindDrive(api), _test: { balance, score, rank, validateMove, PLACE_PTS } };
