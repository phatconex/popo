const test = require('node:test');
const assert = require('node:assert');
const BK = require('../public/games/bonk3d/shared.js');
const Bonk = require('../server/games/bonk');

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function fakeApi(n = 3, settings = { map: 'beach', rounds: '5' }, seed = 7) {
  const players = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), av: i, ws: null }));
  const api = {
    settings, rand: mulberry(seed), players: () => players, sent: [], sends: {}, ended: [],
    send: (p, d) => { (api.sends[p.id] = api.sends[p.id] || []).push(d); },
    bcast: d => api.sent.push(d),
    end: w => api.ended.push(w),
  };
  return api;
}
const make = (mod, n, settings, seed) => { const api = fakeApi(n, settings, seed); const g = mod.create(api); g.start(); return { api, g }; };
const ofType = (api, t) => api.sent.filter(d => d.t === t);
const lastS = (api) => ofType(api, 's').at(-1);
const row = (api, id) => lastS(api).p.find(r => r[0] === id);
const tick = (g, secs) => { for (let i = 0, n = Math.round(secs / .05); i < n; i++) g.tick(.05); };
const toPlay = (g) => { while (g.phase === 'count') g.tick(.05); };
const st = (g, id, o = {}) => g.onMsg({ id }, { t: 'st', rd: g.rd, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, f: 0, fl: 0, ch: 0, ...o });
const put = (g, id, x, z) => { const b = g.gs.get(id).body; b.x = x; b.z = z; };
const fall = (g, id) => g.onMsg({ id }, { t: 'fall', rd: g.rd });
const earliestDrop = (api) => ofType(api, 'round').at(-1).breaks.reduce((a, b) => (b[3] < a[3] ? b : a));
const leave = (api, g, id) => { const i = api.players().findIndex(p => p.id === id); const [p] = api.players().splice(i, 1); g.onLeave(p); };

test('meta', () => {
  const m = Bonk.meta;
  assert.strictEqual(m.id, 'bonk');
  assert.strictEqual(m.name, 'Bonk Island');
  assert.deepStrictEqual(m.settings.map(s => s.label), ['Map', 'Rounds']);
  assert.deepStrictEqual(m.settings[1].options.map(o => o.v), ['3', '5', '7']);
  assert.strictEqual(m.settings[1].def, '5');
  assert.strictEqual(m.settings[0].def, 'random');
  assert.deepStrictEqual([m.min, m.max, m.tag], [2, 12, 'Brawl']);
});

test('start broadcasts round 1 and play begins after the 3 s countdown', () => {
  const { api, g } = make(Bonk, 4);
  const r = ofType(api, 'round')[0];
  assert.strictEqual(r.rd, 1); assert.strictEqual(r.of, 5); assert.strictEqual(r.c, -3);
  assert.deepStrictEqual(Object.keys(r.spawn).map(Number).sort(), [1, 2, 3, 4]);
  assert.strictEqual(r.map, 'beach'); assert.strictEqual(r.obst.length, 2);
  tick(g, 2.5);
  assert.strictEqual(lastS(api).ph, 'count');
  tick(g, .6);
  assert.strictEqual(lastS(api).ph, 'play');
  assert.ok(lastS(api).c > 0 && Array.isArray(lastS(api).nuts));
});

test('rounds setting falls back to 5', () => {
  const { api } = make(Bonk, 2, { map: 'snow', rounds: 'x' });
  assert.strictEqual(ofType(api, 'round')[0].of, 5);
  assert.strictEqual(ofType(api, 'round')[0].map, 'snow');
});

test('st within limits is accepted; fl and ch echo', () => {
  const { api, g } = make(Bonk, 3);
  tick(g, .05);
  const b = g.gs.get(1).body;
  st(g, 1, { x: b.x + .3, z: b.z, f: 1.5, fl: 1, ch: .5 });
  tick(g, .05);
  const r = row(api, 1);
  assert.ok(Math.abs(r[1] - (b.x)) < .01 && r[1] !== 0);
  assert.deepStrictEqual([r[4], r[5], r[6], r[7]], [1.5, 1, .5, 0]);
  assert.strictEqual(api.sends[1], undefined, 'no fix');
});

test('a 5 m jump in one tick gets fix and is not applied', () => {
  const { api, g } = make(Bonk, 3);
  tick(g, .05);
  const b = g.gs.get(1).body, x0 = b.x;
  st(g, 1, { x: x0 + 5, z: b.z });
  const fix = api.sends[1].at(-1);
  assert.strictEqual(fix.t, 'fix'); assert.strictEqual(fix.rd, 1);
  assert.ok(Math.abs(fix.x - x0) < .01);
  assert.strictEqual(b.x, x0);
});

test('malformed st is ignored without throwing', () => {
  const { api, g } = make(Bonk, 3);
  tick(g, .05);
  const b = g.gs.get(1).body, x0 = b.x, z0 = b.z;
  const bad = [{ x: 'abc' }, { x: NaN }, { x: 1e9 }, { z: Infinity }, { vx: 500 }, { f: null }, { y: undefined }];
  for (const o of bad) assert.doesNotThrow(() => st(g, 1, { x: x0, z: z0, ...o }));
  const missing = { t: 'st', rd: 1, x: x0, z: z0 };
  assert.doesNotThrow(() => g.onMsg({ id: 1 }, missing));
  for (const d of [null, 5, 'st', [], { t: 'st' }, { rd: 1 }]) assert.doesNotThrow(() => g.onMsg({ id: 1 }, d));
  assert.doesNotThrow(() => g.onMsg({ id: 99 }, { t: 'st', rd: 1 }));
  assert.deepStrictEqual([b.x, b.z], [x0, z0]);
  assert.strictEqual(api.sends[1], undefined);
});

test('st from a previous round is ignored', () => {
  const { api, g } = make(Bonk, 3);
  tick(g, .05);
  const b = g.gs.get(1).body, x0 = b.x;
  g.onMsg({ id: 1 }, { t: 'st', rd: 0, x: x0 + .3, z: b.z, y: 0, vx: 0, vz: 0, vy: 0, f: 0 });
  g.onMsg({ id: 1 }, { t: 'st', x: x0 + .3, z: b.z, y: 0, vx: 0, vz: 0, vy: 0, f: 0 });
  assert.strictEqual(b.x, x0);
  assert.strictEqual(api.sends[1], undefined);
});

// Put everyone but `victim` on the centre tile (never drops) and the victim on the tile that drops first.
function arrange(api, g, victim) {
  const [q, r, , drop] = earliestDrop(api), [x, z] = BK.hexToXZ(q, r);
  for (const id of g.gs.keys()) put(g, id, id === victim ? x : 0, id === victim ? z : 0);
  return drop;
}

test('standing on a tile that drops: the tile falls away and the owner is out within 1.1 s', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  const drop = arrange(api, g, 1), b = g.gs.get(1).body;
  let outAt = null;
  while (g.c < drop + 3 && outAt === null) {
    st(g, 1, { x: b.x, z: b.z }); st(g, 2); st(g, 3); // all three keep reporting
    g.tick(.05);
    if (ofType(api, 'out').length) outAt = g.c;
  }
  assert.ok(outAt !== null, 'never out');
  assert.ok(outAt >= drop && outAt - drop <= 1.15, `out ${outAt - drop} s after the drop`);
  const o = ofType(api, 'out')[0];
  assert.deepStrictEqual([o.id, o.place, o.by], [1, 3, 0]);
  assert.strictEqual(row(api, 1)[7], 1, 'ghost flag');
});

test('a reported fall is out 0.6 s later', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  fall(g, 2);
  tick(g, .5);
  assert.strictEqual(ofType(api, 'out').length, 0);
  assert.strictEqual(row(api, 2)[5] & 32, 32);
  tick(g, .2);
  assert.strictEqual(ofType(api, 'out').length, 1);
  assert.strictEqual(ofType(api, 'out')[0].id, 2);
});

test('silent client: the server simulates the body and falls it with its tile; a far st gets fix', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  tick(g, 1.2);
  const drop = arrange(api, g, 1); // no st since the countdown
  tick(g, .1);
  assert.strictEqual(g.gs.get(1).simmed, true);
  const b = g.gs.get(1).body, [bx, bz] = [b.x, b.z];
  st(g, 1, { x: bx + 5, z: bz });
  assert.strictEqual(api.sends[1].at(-1).t, 'fix');
  assert.deepStrictEqual([b.x, b.z], [bx, bz]);
  st(g, 1, { x: bx + .5, z: bz }); // a returning tab that is close is accepted (dt 0.05)
  assert.strictEqual(b.x, bx + .5);
  put(g, 1, bx, bz);
  tick(g, 1.2); // silent again
  let n = 0;
  while (g.c < drop + 3 && !ofType(api, 'out').length && n++ < 1000) g.tick(.05);
  assert.strictEqual(ofType(api, 'out')[0].id, 1);
  assert.ok(g.c - drop <= .75, `out ${g.c - drop} s after the drop`);
});

test('places and points; KO credit within 4 s, not for self-falls or stale hits', () => {
  const { api, g } = make(Bonk, 4);
  toPlay(g);
  for (const id of g.gs.keys()) put(g, id, 0, 0);
  const [A, B, C, D] = [1, 2, 3, 4];
  g.gs.get(A).lastHit = { by: D, a: 'push', at: g.t - 1 };     // D credited
  g.gs.get(B).lastHit = { by: C, a: 'bonk', at: g.t - 5 };     // too old
  g.gs.get(C).lastHit = { by: C, a: 'push', at: g.t };         // self
  for (const id of [A, B, C]) { fall(g, id); tick(g, 1); }
  const outs = ofType(api, 'out');
  assert.deepStrictEqual(outs.map(o => [o.id, o.place, o.by]), [[A, 4, D], [B, 3, 0], [C, 2, 0]]);
  assert.strictEqual(outs[0].a, 'push');
  tick(g, .1);
  const re = ofType(api, 'roundEnd')[0];
  assert.strictEqual(re.win, D); assert.strictEqual(re.last, false); assert.strictEqual(re.rd, 1);
  const by = Object.fromEntries(re.rows.map(r => [r.id, r]));
  assert.deepStrictEqual([by[D].place, by[D].got, by[D].ko, by[D].total], [1, 6, 1, 6]);
  assert.deepStrictEqual([by[C].got, by[B].got, by[A].got], [3, 2, 1]);
  assert.deepStrictEqual(re.rows.map(r => r.id), [D, C, B, A]);
});

test('nobody standing: no place 1, win null', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  for (const id of g.gs.keys()) put(g, id, 0, 0);
  fall(g, 1); tick(g, 1);
  fall(g, 2); fall(g, 3); tick(g, 1);
  const re = ofType(api, 'roundEnd')[0];
  assert.strictEqual(re.win, null);
  assert.ok(!re.rows.some(r => r.place === 1));
  assert.deepStrictEqual(re.rows.map(r => r.place), [2, 2, 3]);
  assert.deepStrictEqual(re.rows.map(r => r.got), [3, 3, 2]);
});

test('disconnect: body stays, is simulated and falls with its tile; rejoin gets round then fix', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  const drop = arrange(api, g, 1);
  const p1 = api.players()[0];
  g.onDisconnect(p1);
  tick(g, .5);
  assert.ok(row(api, 1), 'still in the snapshot');
  assert.strictEqual(ofType(api, 'out').length, 0);
  while (g.c < drop - .2) g.tick(.05);
  g.onRejoin(p1);
  const got = api.sends[1];
  assert.deepStrictEqual(got.map(d => d.t), ['round', 'fix']);
  assert.strictEqual(got[0].rd, 1); assert.ok(Math.abs(got[0].c - g.c) < .01);
  assert.deepStrictEqual(Object.keys(got[0].spawn).length, 3);
  g.onDisconnect(p1);
  let n = 0;
  while (!ofType(api, 'out').length && n++ < 1000) g.tick(.05);
  assert.strictEqual(ofType(api, 'out')[0].id, 1);
});

test('a server-simulated body is pushed out of an obstacle', () => {
  const { api, g } = make(Bonk, 3);
  toPlay(g);
  const [q, r] = ofType(api, 'round')[0].obst[0], [ox, oz] = BK.hexToXZ(q, r);
  g.onDisconnect(api.players()[0]);
  put(g, 1, ox + .3, oz);
  tick(g, .05);
  const b = g.gs.get(1).body;
  assert.ok(Math.hypot(b.x - ox, b.z - oz) >= BK.OBST_R + BK.BODY_R - 1e-6);
});

test('leaving alive counts as out; leaving in the count and in the pause does not throw', () => {
  const { api, g } = make(Bonk, 4);
  leave(api, g, 4); // in the countdown
  assert.strictEqual(api.ended.length, 0);
  toPlay(g);
  leave(api, g, 3); // alive, in play -> out now, 2 players remain
  const o = ofType(api, 'out').at(-1);
  assert.deepStrictEqual([o.id, o.place], [3, 3]);
  assert.strictEqual(api.ended.length, 0);
  fall(g, 2); tick(g, 1);
  assert.strictEqual(ofType(api, 'roundEnd').length, 1);
  assert.strictEqual(g.phase, 'pause');
  leave(api, g, 2); // pause, 1 player left -> end([]) (not the last round)
  assert.deepStrictEqual(api.ended, [[]]);
  assert.doesNotThrow(() => tick(g, 10));
  assert.strictEqual(api.ended.length, 1);
});

test('2 -> 1 players during play ends with []', () => {
  const { api, g } = make(Bonk, 2);
  toPlay(g);
  leave(api, g, 1);
  assert.deepStrictEqual(api.ended, [[]]);
  tick(g, 1);
  assert.strictEqual(api.ended.length, 1);
});

// FAST_T match: fresh module so BK_FAST is read at load.
function loadFast() {
  const prev = process.env.BK_FAST, path = require.resolve('../server/games/bonk');
  process.env.BK_FAST = '1'; delete require.cache[path];
  const m = require(path);
  if (prev === undefined) delete process.env.BK_FAST; else process.env.BK_FAST = prev;
  delete require.cache[path];
  return m;
}
// Plays rounds until `until` roundEnds exist; the highest id wins every round, others fall one by one.
function playRounds(api, g, until) {
  let guard = 0;
  while (ofType(api, 'roundEnd').length < until && guard++ < 5000) {
    if (g.phase === 'play') {
      const alive = [...g.gs.values()].filter(x => !x.out && x.fallT < 0).map(x => x.id).sort((a, b) => a - b);
      if (alive.length > 1) fall(g, alive[0]);
    }
    tick(g, .05);
  }
}

test('full match in fast mode: 3 rounds, one final, end called once with the top scorer', () => {
  const F = loadFast();
  assert.strictEqual(F._test.FAST_T.count, 1);
  const { api, g } = make(F, 3, { map: 'random', rounds: '3' });
  playRounds(api, g, 3);
  assert.strictEqual(ofType(api, 'roundEnd').length, 3);
  assert.deepStrictEqual(ofType(api, 'roundEnd').map(r => r.last), [false, false, true]);
  assert.deepStrictEqual(ofType(api, 'round').map(r => [r.rd, r.c]), [[1, -1], [2, -1], [3, -1]]);
  assert.strictEqual(new Set(ofType(api, 'round').map(r => r.map)).size, 3, 'random map rotates through all three');
  const fin = ofType(api, 'final');
  assert.strictEqual(fin.length, 1);
  assert.deepStrictEqual(fin[0].rows[0], { id: 3, total: 15, rank: 1 });
  assert.strictEqual(api.ended.length, 0);
  tick(g, 2.5);
  assert.strictEqual(api.ended.length, 0);
  tick(g, 1);
  assert.deepStrictEqual(api.ended, [[3]]);
  tick(g, 20);
  assert.strictEqual(api.ended.length, 1);
  assert.strictEqual(ofType(api, 'round').length, 3);
});

test('leaving in the final pause: 3 -> 2 keeps going, 2 -> 1 finishes with the winner', () => {
  const F = loadFast();
  const { api, g } = make(F, 3, { map: 'beach', rounds: '3' });
  playRounds(api, g, 3);
  assert.strictEqual(g.phase, 'final');
  leave(api, g, 1);
  assert.strictEqual(api.ended.length, 0);
  leave(api, g, 2);
  assert.deepStrictEqual(api.ended, [[3]]);
  assert.doesNotThrow(() => tick(g, 10));
  assert.strictEqual(api.ended.length, 1);
});

test('final with tied totals ends with all tied winners', () => {
  const F = loadFast();
  const { api, g } = make(F, 2, { map: 'beach', rounds: '3' });
  g.rd = 2; g.startRound(); // jump to the last round
  toPlay(g);
  for (const id of g.gs.keys()) put(g, id, 0, 0);
  // both fall at once: places 2 and 2 -> 3 points each, so totals tie and both win
  fall(g, 1); fall(g, 2); tick(g, 1);
  tick(g, 3.5);
  assert.deepStrictEqual(api.ended[0].slice().sort(), [1, 2]);
});

// ---- Task 4: combat, bumps, coconuts -------------------------------------------------------------------
const act = (g, id, o = {}) => g.onMsg({ id }, { t: 'act', rd: g.rd, a: 'push', q: 1, c: 0, ...o });
const hit = (g, id, o = {}) => g.onMsg({ id }, { t: 'hit', rd: g.rd, id: 2, a: 'push', q: 1, c: 0, dx: 1, dz: 0, ...o });
const knocks = (api, id) => (api.sends[id] || []).filter(d => d.t === 'knock');
const speed = (k) => Math.hypot(k.vx, k.vz);
// players 1 and 2 on the centre tile (1 m apart), both reporting st; play started
function duel(n = 3) {
  const { api, g } = make(Bonk, n);
  toPlay(g);
  for (let id = 1; id <= n; id++) put(g, id, id === 2 ? 1 : id === 1 ? 0 : 0, id <= 2 ? 0 : 0);
  for (let id = 3; id <= n; id++) put(g, id, -1.5, 0);
  tick(g, .05);
  for (let id = 1; id <= n; id++) st(g, id, { x: g.gs.get(id).body.x, z: 0 });
  return { api, g };
}

test('a plausible push is knocked back with server power and by; the same q only once', () => {
  const { api, g } = duel();
  act(g, 1); hit(g, 1); hit(g, 1);
  const k = knocks(api, 2);
  assert.strictEqual(k.length, 1);
  assert.ok(Math.abs(speed(k[0]) - 4.6) < .01 && k[0].by === 1 && k[0].a === 'push' && k[0].rd === 1 && k[0].vy > 0 && k[0].stun > 0);
  assert.ok(ofType(api, 'fx').some(f => f.a === 'push' && f.id === 1 && f.rd === 1));
});

test('hits are rejected without act, on cooldown, when far, stunned, falling, out, unknown or malformed', () => {
  let { api, g } = duel();
  hit(g, 1);                                   // no act
  assert.strictEqual(knocks(api, 2).length, 0);
  act(g, 1, { q: 1 }); hit(g, 1, { q: 2 });    // wrong q
  hit(g, 1, { a: 'bonk' });                    // wrong kind
  assert.strictEqual(knocks(api, 2).length, 0);
  tick(g, .2); act(g, 1, { q: 2 }); hit(g, 1, { q: 2 }); // second push 0.2 s later: on cooldown
  assert.strictEqual(knocks(api, 2).length, 0);
  tick(g, .5); hit(g, 1, { q: 1 });            // act is too old
  assert.strictEqual(knocks(api, 2).length, 0);

  ({ api, g } = duel());
  put(g, 2, 3, 0); tick(g, .5); act(g, 1); hit(g, 1);       // 3 m away
  assert.strictEqual(knocks(api, 2).length, 0);

  ({ api, g } = duel());
  st(g, 1, { x: 0, fl: 2 }); act(g, 1); hit(g, 1);          // stunned attacker
  assert.strictEqual(knocks(api, 2).length, 0);

  ({ api, g } = duel());
  act(g, 1); fall(g, 2); tick(g, .05); hit(g, 1);           // falling target
  assert.strictEqual(knocks(api, 2).length, 0);
  tick(g, .7); hit(g, 1);                                    // out target (same q: used or not, still no knock)
  assert.strictEqual(knocks(api, 2).length, 0);

  ({ api, g } = duel());
  act(g, 1);
  for (const o of [{ id: 99 }, { id: 'x' }, { id: null }, { id: 1 }, { q: 'a' }, { a: 5 }]) assert.doesNotThrow(() => hit(g, 1, o));
  assert.strictEqual(knocks(api, 2).length, 0);

  ({ api, g } = duel());
  act(g, 1, { a: 'zap' }); act(g, 1, { q: NaN });
  assert.strictEqual(ofType(api, 'fx').length, 0);
  act(g, 1); hit(g, 1, { dx: NaN, dz: 0 });                  // falls back to attacker -> target (+x)
  const k = knocks(api, 2);
  assert.strictEqual(k.length, 1);
  assert.ok(k[0].vx > 4.5 && Math.abs(k[0].vz) < .01);
});

test('bonk knock speed follows c and c is clamped to 0..1', () => {
  let { api, g } = duel();
  act(g, 1, { a: 'bonk' }); hit(g, 1, { a: 'bonk', c: 1 });
  assert.ok(Math.abs(speed(knocks(api, 2)[0]) - 10) < .01);
  ({ api, g } = duel());
  act(g, 1, { a: 'bonk' }); hit(g, 1, { a: 'bonk', c: 5 });
  assert.ok(Math.abs(speed(knocks(api, 2)[0]) - 10) < .01);
  ({ api, g } = duel());
  act(g, 1, { a: 'bonk' }); hit(g, 1, { a: 'bonk', c: -3 });
  assert.ok(Math.abs(speed(knocks(api, 2)[0]) - 4.5) < .01);
});

test('KO credit: fall within 4 s credits the hitter; later or self-fall credits nobody', () => {
  let { api, g } = duel();
  act(g, 1); hit(g, 1); tick(g, 1); fall(g, 2); tick(g, .7);
  assert.strictEqual(g.gs.get(1).ko, 1);
  assert.strictEqual(ofType(api, 'out').at(-1).by, 1);

  ({ api, g } = duel());
  act(g, 1); hit(g, 1); tick(g, 4.2); fall(g, 2); tick(g, .7);
  assert.strictEqual(g.gs.get(1).ko, 0);
  assert.strictEqual(ofType(api, 'out').at(-1).by, 0);

  ({ api, g } = duel());
  fall(g, 2); tick(g, .7);
  assert.strictEqual(g.gs.get(1).ko, 0);
});

test('an offline victim is moved by the hit on the server', () => {
  const { api, g } = duel();
  g.onDisconnect({ id: 2 });
  act(g, 1); hit(g, 1);
  assert.strictEqual(knocks(api, 2).length, 0);
  const b = g.gs.get(2).body;
  assert.ok(b.vx > 4 && b.stun > 0 && b.vy > 0);
  const x0 = b.x; tick(g, .3);
  assert.ok(b.x > x0 + .3);
});

test('a dash hit knocks like a body bump', () => {
  const { api, g } = duel();
  act(g, 1, { a: 'dash' }); hit(g, 1, { a: 'dash' });
  assert.ok(Math.abs(speed(knocks(api, 2)[0]) - 4.5) < .01);
});

test('bump: a dashing body knocks a still one once per 0.3 s', () => {
  const { api, g } = duel();
  put(g, 2, .5, 0); put(g, 1, 0, 0);
  st(g, 1, { x: 0, vx: 10, fl: 8 }); st(g, 2, { x: .5 });
  tick(g, .05);
  const k = knocks(api, 2);
  assert.strictEqual(k.length, 1);
  assert.ok(Math.abs(speed(k[0]) - 4.5) < .01 && k[0].by === 1);
  tick(g, .1);
  assert.strictEqual(knocks(api, 2).length, 1);
  tick(g, .3);
  assert.strictEqual(knocks(api, 2).length, 2);
});

test('bump: a flying stunned body credits its own hitter; slow contact does nothing', () => {
  let { api, g } = duel(4);
  put(g, 3, 1.8, 0); put(g, 2, 1, 0); tick(g, .05);
  st(g, 3, { x: 1.8 }); st(g, 2, { x: 1 }); st(g, 1, { x: 0 });
  act(g, 1); hit(g, 1);                       // 1 knocks 2 (credit 1)
  put(g, 2, 1.3, 0);                          // 2 flies into 3, 0.5 m away
  st(g, 2, { x: 1.3, vx: 8, y: .5, vy: 1, fl: 18 });
  tick(g, .05);
  assert.strictEqual(knocks(api, 3).length, 1);
  assert.strictEqual(knocks(api, 3)[0].by, 1);

  ({ api, g } = duel(3));
  put(g, 2, .5, 0); st(g, 1, { x: 0, vx: 2, fl: 8 }); st(g, 2, { x: .5 });
  tick(g, .05);
  assert.strictEqual(knocks(api, 2).length, 0);
});

// A ghost: player 3 falls out. Others stand on the centre tile.
function ghostGame() {
  const { api, g } = duel(3);
  fall(g, 3); tick(g, .7);
  assert.ok(g.gs.get(3).out);
  return { api, g };
}
const nut = (g, id, x, z) => g.onMsg({ id }, { t: 'nut', rd: g.rd, x, z });

test('coconut: lands after ~1.13 s, knocks a body within 1.4 m, spares one farther, credits the ghost', () => {
  const { api, g } = ghostGame();
  put(g, 1, 0, 0); put(g, 2, 1, 0); st(g, 1, { x: 0 }); st(g, 2, { x: 1 });
  nut(g, 3, -1, 0);
  tick(g, .05);
  assert.strictEqual(lastS(api).nuts.length, 1);
  assert.ok(Math.abs(lastS(api).nuts[0][2] - g.c - 1.08) < .1);
  tick(g, .9); st(g, 1, { x: 0 }); st(g, 2, { x: 1 }); tick(g, .1);
  assert.strictEqual(knocks(api, 1).length, 0);
  assert.strictEqual(ofType(api, 'fx').filter(f => f.a === 'thunk').length, 0);
  tick(g, .2);
  assert.strictEqual(ofType(api, 'fx').filter(f => f.a === 'thunk').length, 1);
  assert.strictEqual(knocks(api, 1).length, 1);
  assert.strictEqual(knocks(api, 2).length, 0);
  const k = knocks(api, 1)[0];
  assert.ok(Math.abs(speed(k) - 4.8) < .01 && k.vx > 0 && k.by === 3);
  assert.strictEqual(lastS(api).nuts.length, 0);
  fall(g, 1); tick(g, .7);
  assert.strictEqual(g.gs.get(3).ko, 1);
  assert.strictEqual(ofType(api, 'out').at(-1).by, 3);
});

test('coconut on water splashes and knocks nobody', () => {
  const { api, g } = ghostGame();
  const r = ofType(api, 'round').at(-1), R = BK.islandRadius(r.rings);
  nut(g, 3, R + .5, 0);
  tick(g, 1.3);
  assert.strictEqual(ofType(api, 'fx').filter(f => f.a === 'splash').length, 1);
  assert.strictEqual(knocks(api, 1).length + knocks(api, 2).length, 0);
});

test('coconut input rules: alive, cooldown, far or non-finite points are ignored', () => {
  const { api, g } = ghostGame();
  nut(g, 1, 1, 0);                               // alive player
  assert.strictEqual(lastS(api).nuts.length, 0);
  tick(g, .05); assert.strictEqual(lastS(api).nuts.length, 0);
  for (const [x, z] of [[1e9, 0], [NaN, 0], ['a', 0], [Infinity, 0], [0, null]]) assert.doesNotThrow(() => nut(g, 3, x, z));
  tick(g, .05); assert.strictEqual(lastS(api).nuts.length, 0);
  nut(g, 3, 1, 0); tick(g, 1);
  nut(g, 3, 1, 1); tick(g, .05);
  assert.strictEqual(lastS(api).nuts.length, 1, 'second nut inside 3.5 s ignored');
  tick(g, 2.6);
  nut(g, 3, 1, 1); tick(g, .05);
  assert.strictEqual(lastS(api).nuts.length, 1, 'accepted after the cooldown');
});

test('per-round combat state is reset', () => {
  const { api, g } = duel();
  act(g, 1); hit(g, 1);
  const a = g.gs.get(1);
  g.startRound();
  assert.deepStrictEqual([Object.keys(a.acts).length, a.hits.size, a.lastHit, a.nutAt], [0, 0, null, -Infinity]);
  assert.strictEqual(ofType(api, 'round').length, 2);
});

test('act fx carries the bonk charge clamped to 0..1, and 0 for push and dash', () => {
  const { api, g } = duel();
  const fxc = () => ofType(api, 'fx').at(-1);
  act(g, 1, { a: 'bonk', q: 1, c: .8 }); assert.strictEqual(fxc().c, .8);
  tick(g, 1.2); act(g, 1, { a: 'bonk', q: 2, c: 5 }); assert.strictEqual(fxc().c, 1);
  tick(g, 1.2); act(g, 1, { a: 'bonk', q: 3, c: NaN }); assert.strictEqual(fxc().c, 0);
  tick(g, 1.2); act(g, 1, { a: 'push', q: 4, c: .7 }); assert.strictEqual(fxc().c, 0);
  assert.strictEqual(fxc().rd, 1);
  act(g, 1, { a: 'dash', q: 5, c: .7 }); assert.strictEqual(fxc().c, 0);
});
