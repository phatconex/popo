'use strict';
// Bonk Island server: round flow, movement checks, falls, scoring, disconnects.
// Message formats: docs/superpowers/specs/2026-11-07-bonk-island-design.md section 4.2.
// Clocks: `this.c` is the round clock (c = 0 is "BONK!", negative while counting down, drives the break
// schedule); `this.t` is a monotone server clock used for lastSt, hist and lastHit.at (so they survive rounds).
const BK = require('../../../public/games/bonk3d/shared.js');
const { T, FAST_T, makeIsland, mapPicker, tileState } = require('./island.js');

const TT = process.env.BK_FAST === '1' ? FAST_T : T;

const meta = {
  id: 'bonk',
  name: 'Bonk Island',
  desc: 'Shove your friends into the sea. Last paw standing wins!',
  min: 2, max: 12, tag: 'Brawl',
  settings: [
    { key: 'map', label: 'Map', def: 'random', options: [{ v: 'random', label: 'Random' }, { v: 'beach', label: 'Beach' }, { v: 'snow', label: 'Snow' }, { v: 'farm', label: 'Farm' }] },
    { key: 'rounds', label: 'Rounds', def: '5', options: [{ v: '3', label: '3' }, { v: '5', label: '5' }, { v: '7', label: '7' }] },
  ],
};

const POINTS = [5, 3, 2, 1];   // by place, 0 after
const SILENT = 1;              // s without an accepted st before the server simulates the body
const OFF_GROUND = .5;         // s standing off a solid tile before the server calls it a fall
const FALL_OUT = .6;           // s from falling to out
const HIST = .5;               // s of position history kept
const ST_DT = .05;             // dt used to check the first st after the server simulated a body
const MAX_ABS = 100;
const MAPS = ['random', 'beach', 'snow', 'farm'];
const ACT_AGE = .4;            // s a hit may trail its act
const REACH_SLACK = .6;        // m of lag compensation on top of REACH
const CD_SLACK = .1;           // s of cooldown tolerance
const PAIR_CD = .3;            // s between bump knocks of one pair
const KINDS = ['push', 'bonk', 'dash'];

const r2 = (v) => Math.round(v * 100) / 100;
const key = (q, r) => q + ',' + r;
const num = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < MAX_ABS;

class Bonk {
  constructor(api) {
    this.api = api;
    this.rand = api.rand || Math.random;
    const s = api.settings || {};
    this.total = ['3', '5', '7'].includes(String(s.rounds)) ? +s.rounds : 5;
    this.pickMap = mapPicker(MAPS.includes(s.map) ? s.map : 'random', this.rand);
    this.gs = new Map();      // id -> player record
    this.rd = 0;
    this.c = 0;
    this.t = 0;
    this.phase = 'idle';      // count | play | pause | final | done
    this.timer = 0;           // pause / final countdown
    this.isl = null;
    this.tiles = new Map();
    this.brk = new Map();
    this.roundMsg = null;
    this.nuts = [];           // coconuts in the air: { x, z, by, landAt (round clock) }
    this.pairAt = new Map();  // "lo:hi" -> t of the last bump knock of that pair
    this.groundAt = (x, z) => this.ground(x, z);
  }

  // ---- helpers -------------------------------------------------------------------------------------------
  ground(x, z) {
    const [q, r] = BK.xzToHex(x, z), k = key(q, r), tile = this.tiles.get(k);
    if (!tile) return -1;
    const b = this.brk.get(k);
    if (b && tileState(b, this.c) === 'drop') return -1;
    return tile.surf;
  }
  centres() {
    return this.isl.obst.filter(([q, r]) => {
      const b = this.brk.get(key(q, r));
      return !b || tileState(b, this.c) !== 'drop';
    }).map(([q, r]) => BK.hexToXZ(q, r));
  }
  // True when the server, not the owner's client, drives this body (offline, silent or just re-synced).
  isSim(g) { return !g.online || g.simmed || this.t - g.lastSt > SILENT; }
  alive() { return [...this.gs.values()].filter((g) => !g.out); }
  player(p) { return this.gs.get(p.id); }

  // ---- flow ----------------------------------------------------------------------------------------------
  start() {
    for (const p of this.api.players()) {
      this.gs.set(p.id, {
        id: p.id, name: p.name, av: p.av, body: null, total: 0, online: true,
      });
      this.resetRound(this.gs.get(p.id));
    }
    this.startRound();
  }

  // Everything per player that lives for one round.
  resetRound(g) {
    Object.assign(g, {
      out: false, ghost: false, place: 0, ko: 0, got: 0, hist: [], offGround: 0, fallT: -1, acts: {}, hits: new Set(),
      lastHit: null, nutAt: -Infinity, knockV: 0, simmed: false, stFl: 0, stCh: 0, lastSt: this.t,
    });
  }

  startRound() {
    this.rd++;
    this.isl = makeIsland({ n: this.gs.size, map: this.pickMap(this.rd - 1), rand: this.rand, T: TT });
    this.tiles = new Map(this.isl.tiles.map((t) => [key(t.q, t.r), t]));
    this.brk = new Map(this.isl.breaks.map((b) => [key(b[0], b[1]), b]));
    this.c = -TT.count;
    this.phase = 'count';
    this.nuts = [];
    this.pairAt.clear();
    const spawn = {};
    let i = 0;
    for (const g of this.gs.values()) {
      const [x, z, f] = this.isl.spawn[i++];
      spawn[g.id] = [r2(x), r2(z), r2(f)];
      g.body = BK.newBody(x, z, f);
      this.resetRound(g);
    }
    const m = this.isl;
    this.roundMsg = { t: 'round', rd: this.rd, of: this.total, map: m.map, rings: m.rings, obst: m.obst, surf: m.surf, breaks: m.breaks, spawn };
    this.api.bcast({ ...this.roundMsg, c: this.c });
  }

  tick(dt) {
    if (this.phase === 'done' || this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'pause' || this.phase === 'final') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.phase === 'pause') this.startRound();
        else this.finish();
      }
      return;
    }
    this.c += dt;
    if (this.phase === 'count' && this.c >= 0) this.phase = 'play';
    const centres = this.centres();
    for (const g of this.gs.values()) {
      if (g.out) continue;
      this.moveBody(g, dt, centres);
      g.hist.push([this.t, g.body.x, g.body.z]);
      while (g.hist.length && this.t - g.hist[0][0] > HIST) g.hist.shift();
    }
    if (this.phase === 'play') { this.bumps(); this.landNuts(); }
    for (const g of [...this.gs.values()]) {
      if (g.out || g.fallT < 0) continue;
      g.fallT += dt;
      if (g.fallT >= FALL_OUT) this.eliminate(g);
    }
    this.snapshot();
    if (this.phase === 'play') this.checkRoundEnd();
  }

  moveBody(g, dt, centres) {
    const b = g.body;
    if (this.phase === 'count' && g.online) g.lastSt = this.t; // nobody moves in the countdown: no silence yet
    if (b.falling) { BK.step(b, { mx: 0, mz: 0 }, dt, this.groundAt); g.simmed = true; return; }
    if (g.online && this.t - g.lastSt <= SILENT && !g.simmed) {
      // owner drives this body: it is whatever the last accepted st said; the server only watches the ground
      if (b.y <= 0 && this.groundAt(b.x, b.z) < 0) g.offGround += dt; else g.offGround = 0;
      if (g.offGround > OFF_GROUND) this.markFall(g);
      return;
    }
    g.simmed = true;
    const ev = BK.step(b, { mx: 0, mz: 0 }, dt, this.groundAt);
    if (ev === 'fall' || b.falling) { this.markFall(g); return; }
    BK.hitObstacles(b, centres);
  }

  markFall(g) {
    if (g.out || g.fallT >= 0) return;
    g.body.falling = true;
    g.fallT = 0;
  }

  // Out of the game for this round: place, KO credit, broadcast. Used by falls and by leaving.
  eliminate(g) {
    if (g.out) return;
    const others = this.alive().filter((o) => o !== g).length;
    g.out = true; g.ghost = true; g.fallT = -1; g.body.falling = true;
    g.place = Math.max(2, others + 1); // nobody standing -> no place 1 (the survivor alone is placed at round end)
    let by = 0, a = '';
    const h = g.lastHit;
    if (h && h.by !== g.id && this.t - h.at <= BK.KO_WINDOW) {
      a = h.a;
      const killer = this.gs.get(h.by);
      if (killer) { killer.ko++; by = killer.id; }
    }
    this.api.bcast({ t: 'out', rd: this.rd, id: g.id, by, a, place: g.place });
  }

  checkRoundEnd() {
    const left = this.alive();
    if (left.length > 1 || left.some((g) => g.fallT >= 0)) return;
    const survivor = left[0] || null;
    if (survivor) survivor.place = 1;
    const last = this.rd >= this.total;
    for (const g of this.gs.values()) {
      g.got = (POINTS[g.place - 1] || 0) + g.ko;
      g.total += g.got;
    }
    const rows = [...this.gs.values()].sort((x, y) => x.place - y.place)
      .map((g) => ({ id: g.id, place: g.place, ko: g.ko, got: g.got, total: g.total }));
    this.api.bcast({ t: 'roundEnd', rd: this.rd, rows, win: survivor ? survivor.id : null, last });
    if (!last) { this.phase = 'pause'; this.timer = TT.pause; return; }
    this.api.bcast({ t: 'final', rd: this.rd, rows: this.finalRows() });
    this.phase = 'final'; this.timer = TT.final;
  }

  finalRows() {
    const sorted = [...this.gs.values()].sort((x, y) => y.total - x.total);
    return sorted.map((g) => ({ id: g.id, total: g.total, rank: 1 + sorted.filter((o) => o.total > g.total).length }));
  }

  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const gs = [...this.gs.values()], top = Math.max(0, ...gs.map((g) => g.total));
    this.api.end(top > 0 ? gs.filter((g) => g.total === top).map((g) => g.id) : []);
  }

  snapshot() {
    const p = [];
    for (const g of this.gs.values()) {
      const b = g.body;
      let fl, ch;
      if (!g.out && !b.falling && !g.simmed) { fl = g.stFl; ch = g.stCh; }
      else { fl = (b.stun > 0 ? 2 : 0) | (b.y > 0 || b.vy > 0 ? 16 : 0) | (b.falling ? 32 : 0); ch = 0; }
      p.push([g.id, r2(b.x), r2(b.z), r2(b.y), r2(b.f), fl, ch, g.ghost ? 1 : 0]);
    }
    this.api.bcast({ t: 's', rd: this.rd, c: r2(this.c), ph: this.phase, p, nuts: this.nuts.map((n) => [r2(n.x), r2(n.z), r2(n.landAt)]) });
  }

  // ---- messages ------------------------------------------------------------------------------------------
  onMsg(p, d) {
    const g = this.player(p);
    if (!g || !d || typeof d !== 'object' || d.rd !== this.rd) return;
    if (d.t === 'st') this.onSt(g, d);
    else if (d.t === 'act') this.onAct(g, d);
    else if (d.t === 'hit') this.onHit(g, d);
    else if (d.t === 'nut') this.onNut(g, d);
    else if (d.t === 'fall') { if (this.phase === 'play' && !g.out) this.markFall(g); }
  }

  fix(g) {
    const b = g.body;
    this.api.send(this.playerOf(g), { t: 'fix', rd: this.rd, x: r2(b.x), z: r2(b.z), y: r2(b.y), vx: r2(b.vx), vz: r2(b.vz), vy: r2(b.vy) });
  }
  playerOf(g) { return this.api.players().find((p) => p.id === g.id) || { id: g.id, ws: null }; }

  onSt(g, d) {
    if (g.out || g.body.falling || (this.phase !== 'count' && this.phase !== 'play')) return;
    if (!['x', 'z', 'y', 'vx', 'vz', 'vy', 'f'].every((k) => num(d[k]))) return;
    const b = g.body, dt = g.simmed ? ST_DT : Math.max(ST_DT, this.t - g.lastSt);
    const limit = Math.max(10, Math.abs(g.knockV) || 0) * dt * 1.5 + .5;
    if (Math.hypot(d.x - b.x, d.z - b.z) > limit) { this.fix(g); return; }
    const fl = Number.isFinite(d.fl) ? Math.max(0, Math.min(63, d.fl | 0)) : 0;
    const ch = Number.isFinite(d.ch) ? Math.max(0, Math.min(1, d.ch)) : 0;
    Object.assign(b, { x: d.x, z: d.z, y: d.y, vx: d.vx, vz: d.vz, vy: d.vy, f: d.f, stun: fl & 2 ? .3 : 0 });
    g.stFl = fl; g.stCh = ch; g.lastSt = this.t; g.simmed = false;
  }

  // ---- combat ----------------------------------------------------------------------------------------------
  canFight(g) { return this.phase === 'play' && !g.out && !g.body.falling; }

  onAct(g, d) {
    if (!this.canFight(g) || g.body.stun > 0 || !KINDS.includes(d.a) || !Number.isFinite(d.q)) return;
    const prev = g.acts[d.a];
    if (prev && this.t < prev.at + BK.CD[d.a] - CD_SLACK) return;
    g.acts[d.a] = { q: d.q, at: this.t };
    const b = g.body, charge = d.a === 'bonk' && Number.isFinite(d.c) ? Math.max(0, Math.min(1, d.c)) : 0;
    this.api.bcast({ t: 'fx', rd: this.rd, a: d.a, id: g.id, x: r2(b.x), z: r2(b.z), c: charge });
  }

  onHit(g, d) {
    if (!this.canFight(g) || !KINDS.includes(d.a) || !Number.isFinite(d.q) || typeof d.id !== 'number') return;
    const v = this.gs.get(d.id), act = g.acts[d.a];
    if (!v || v === g || v.out || v.body.falling || !act || act.q !== d.q || this.t - act.at > ACT_AGE) return;
    const used = d.a + ':' + d.q + ':' + v.id;
    if (g.hits.has(used)) return;
    const reach = BK.REACH[d.a] + REACH_SLACK, b = g.body;
    const near = (x, z) => Math.hypot(x - b.x, z - b.z) <= reach;
    if (!(v.hist.some((h) => this.t - h[0] <= ACT_AGE && near(h[1], h[2])) || near(v.body.x, v.body.z))) return;
    g.hits.add(used);
    let dx = num(d.dx) ? d.dx : 0, dz = num(d.dz) ? d.dz : 0, m = Math.hypot(dx, dz);
    if (m < 1e-6) { dx = v.body.x - b.x; dz = v.body.z - b.z; m = Math.hypot(dx, dz); }
    if (m < 1e-6) { dx = Math.sin(b.f); dz = Math.cos(b.f); m = 1; }
    const k = d.a === 'dash' ? BK.knockOf('bump', BK.DASH.v) : BK.knockOf(d.a, Math.max(0, Math.min(1, Number.isFinite(d.c) ? d.c : 0)));
    this.knock(v, dx / m, dz / m, k, g.id, d.a);
    if (d.a === 'dash') this.pairAt.set(Math.min(g.id, v.id) + ':' + Math.max(g.id, v.id), this.t); // no extra bump from the same dash
  }

  // Knock `v` (unit direction dx, dz) and remember who gets the KO (by 0: nobody, lastHit stays as it was).
  knock(v, dx, dz, k, by, a) {
    if (by) v.lastHit = { by, a, at: this.t };
    v.knockV = k.power;
    if (this.isSim(v)) { BK.applyKnock(v.body, dx, dz, k); return; }
    this.api.send(this.playerOf(v), { t: 'knock', rd: this.rd, vx: r2(dx * k.power), vz: r2(dz * k.power), vy: k.vy, stun: k.stun, by, a });
  }

  // Motion state used for bumps: from the last accepted st (online) or the simulated body.
  motion(g) {
    const b = g.body;
    if (this.isSim(g)) return { fly: b.stun > 0 && (b.y > 0 || b.vy > 0), dash: b.dash > 0 };
    const fl = g.stFl;
    return { fly: !!(fl & 2) && (!!(fl & 16) || b.y > 0), dash: !!(fl & 8) };
  }

  bumps() {
    const list = [...this.gs.values()].filter((g) => !g.out && !g.body.falling);
    const mo = new Map(list.map((g) => [g, this.motion(g)]));
    const m2 = BK.BODY_R * 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j], a = A.body, b = B.body;
        const mA = mo.get(A), mB = mo.get(B);
        if (!(mA.fly || mA.dash || mB.fly || mB.dash)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= m2 || Math.abs(a.y - b.y) > .7) continue;
        const pk = Math.min(A.id, B.id) + ':' + Math.max(A.id, B.id);
        if (this.t - (this.pairAt.get(pk) ?? -Infinity) < PAIR_CD) continue;
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing <= BK.BUMP.min) continue;
        this.pairAt.set(pk, this.t);
        const k = BK.knockOf('bump', closing);
        // credit: the dashing body itself, or whoever knocked the flying one
        const give = (src, dst, ux, uz) => {
          const by = mo.get(src).dash ? src.id : src.lastHit ? src.lastHit.by : 0;
          this.knock(dst, ux, uz, k, by === dst.id ? 0 : by, 'bump');
        };
        if (mA.fly || mA.dash) give(A, B, nx, nz);
        if (mB.fly || mB.dash) give(B, A, -nx, -nz);
      }
    }
  }

  onNut(g, d) {
    if (this.phase !== 'play' || !g.out || !num(d.x) || !num(d.z)) return;
    if (g.nutAt + BK.CD.nut > this.c) return;
    if (Math.hypot(d.x, d.z) > BK.islandRadius(this.isl.rings) + 1) return;
    g.nutAt = this.c;
    this.nuts.push({ x: d.x, z: d.z, by: g.id, landAt: this.c + Math.sqrt(2 * BK.NUT.h / BK.NUT.g) });
  }

  landNuts() {
    if (!this.nuts.length) return;
    const due = this.nuts.filter((n) => n.landAt <= this.c);
    if (!due.length) return;
    this.nuts = this.nuts.filter((n) => n.landAt > this.c);
    const k = BK.knockOf('nut');
    for (const n of due) {
      const solid = this.ground(n.x, n.z) >= 0;
      this.api.bcast({ t: 'fx', rd: this.rd, a: solid ? 'thunk' : 'splash', x: r2(n.x), z: r2(n.z) });
      if (!solid) continue;
      for (const v of [...this.gs.values()]) {
        if (v.out || v.body.falling) continue;
        let dx = v.body.x - n.x, dz = v.body.z - n.z;
        const d = Math.hypot(dx, dz);
        if (d > BK.NUT.r) continue;
        if (d < 1e-6) { const an = this.rand() * Math.PI * 2; dx = Math.cos(an); dz = Math.sin(an); } else { dx /= d; dz /= d; }
        this.knock(v, dx, dz, k, n.by, 'nut');
      }
    }
  }

  // ---- connection ----------------------------------------------------------------------------------------
  onDisconnect(p) { const g = this.player(p); if (g) g.online = false; }

  onRejoin(p) {
    const g = this.player(p);
    if (!g || this.phase === 'idle' || this.phase === 'done') return;
    g.online = true; g.lastSt = this.t; g.simmed = true; // the next st is checked against the server body
    this.api.send(p, { ...this.roundMsg, c: r2(this.c) });
    this.fix(g);
  }

  onLeave(p) {
    const g = this.player(p);
    if (!g || this.phase === 'done') return;
    if ((this.phase === 'count' || this.phase === 'play') && !g.out) this.eliminate(g);
    this.gs.delete(g.id);
    if (this.gs.size >= 2) return;
    if (this.phase === 'final') this.finish();
    else { this.phase = 'done'; this.api.end([]); }
  }
}

module.exports = { meta, create: (api) => new Bonk(api), _test: { T, FAST_T } };
