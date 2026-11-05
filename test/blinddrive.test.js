const test = require('node:test');
const assert = require('node:assert');
const BD = require('../public/games/blinddrive3d/shared.js');

const flat = { slope: 0, slick: 0, ice: 0, off: 0 };
const run = (env, inp, secs, v = 0) => { const c = { x: 0, z: 0, a: 0, v, lat: 0 }; for (let i = 0; i < secs * 60; i++) BD.stepCar(c, inp, env, 1 / 60); return c; };
const track = { pts: Array.from({ length: 21 }, (_, i) => [0, i * 2]), rw: 1.9, hills: [], slicks: [], theme: 'country' };

test('rng is deterministic', () => { const a = BD.rng(42), b = BD.rng(42); assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]); });
test('heightAt sums gaussian hills', () => { const h = [{ x: 0, z: 0, h: 3, s: 10 }]; assert.strictEqual(BD.heightAt(h, 0, 0), 3); assert.ok(BD.heightAt(h, 30, 0) < .1); });
test('slopeAlong is positive going uphill', () => {
  const h = [{ x: 0, z: 10, h: 3, s: 5 }];
  assert.ok(BD.slopeAlong(h, 0, 5, 0) > 0);
  assert.ok(BD.slopeAlong(h, 0, 15, 0) < 0);
});
test('stepCar caps speed on road and grass', () => {
  assert.ok(Math.abs(run(flat, { gas: 1 }, 4).v - BD.CAR.VMAX) < .01);
  assert.ok(run({ ...flat, off: 1 }, { gas: 1 }, 4).v <= BD.CAR.VMAX_OFF + 1e-9);
});
test('stepCar: uphill slower, downhill faster, rolls back with no gas', () => {
  const up = run({ ...flat, slope: .2 }, { gas: 1 }, 2), dn = run({ ...flat, slope: -.2 }, {}, 2, 1), fl = run(flat, { gas: 1 }, 2);
  assert.ok(up.v < fl.v); assert.ok(dn.v > 1);
  assert.ok(run({ ...flat, slope: .2 }, {}, 3, 1).v < 0);
});
test('stepCar reverse is capped and deterministic', () => {
  const r = run(flat, { rev: 1 }, 4); assert.ok(r.v >= BD.CAR.VREV - 1e-9 && r.v < 0);
  assert.deepStrictEqual(run(flat, { gas: 1, steer: .5 }, 3), run(flat, { gas: 1, steer: .5 }, 3));
});
test('stepCar brake stops without reversing; drag only when coasting', () => {
  const b = run(flat, { brake: 1 }, 3, 5); assert.strictEqual(b.v, 0);
  const c = run(flat, {}, 1, 4); assert.ok(Math.abs(c.v - 4 * (1 - BD.CAR.DRAG)) < .02);
});
test('steer right moves toward the right vector', () => {
  const c = run(flat, { gas: 1, steer: 1 }, 1);
  const tx = Math.sin(0), tz = Math.cos(0), rx = -tz, rz = tx; // right vector of heading 0
  assert.ok(c.x * rx + c.z * rz > 0.1);
  const l = run(flat, { gas: 1, steer: -1 }, 1);
  assert.ok(l.x * rx + l.z * rz < -0.1);
});
test('slick surface slides more than grippy road', () => {
  const inp = { gas: 1, steer: 1 };
  const g = run(flat, inp, 1.5, 6), s = run({ ...flat, slick: 1 }, inp, 1.5, 6);
  assert.ok(Math.abs(s.lat) > Math.abs(g.lat));
});
test('crosserPos crosses the road and rests on each side', () => {
  const c = { i: 10, kind: 3, ph: 0, spd: 2 };
  const amp = track.rw + 2, period = 4 * amp / c.spd + 3;
  let maxOff = 0, onRoad = 0, restL = 0, restR = 0;
  const p0 = track.pts[10];
  for (let t = 0; t < period; t += 0.05) {
    const p = BD.crosserPos(track, c, t), off = Math.hypot(p.x - p0[0], p.z - p0[1]);
    maxOff = Math.max(maxOff, off);
    if (p.onRoad) onRoad++;
    if (p.dir === 0) { if (p.x - p0[0] > 0) restL += 0.05; else restR += 0.05; } // right of +z is -x
  }
  assert.ok(Math.abs(maxOff - amp) < 0.1);
  assert.ok(onRoad > 0);
  assert.ok(restL >= 1.4 && restR >= 1.4);
  const a = BD.crosserPos(track, c, 3.3), b = BD.crosserPos(track, c, 3.3 + period);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9);
});
test('nearestOnTrack and envAt', () => {
  const n = BD.nearestOnTrack(track, -1, 10); // 1 m right of pts[5]
  assert.strictEqual(n.i, 5); assert.ok(Math.abs(n.dist - 1) < 1e-9); assert.strictEqual(n.side, 1);
  assert.ok(Math.abs(n.s - 5 / 20) < 1e-9);
  assert.strictEqual(BD.nearestOnTrack(track, 1, 10).side, -1);
  assert.strictEqual(BD.envAt(track, -1, 10, 0).off, 0);
  const e = BD.envAt(track, -3, 10, 0);
  assert.strictEqual(e.off, 1); assert.ok(Math.abs(e.edge - 1.1) < 1e-9);
});
test('envAt slick ellipse and ice on snow', () => {
  const t = { ...track, slicks: [{ x: 0, z: 20, rx: 3, rz: 4, a: 0 }] };
  assert.strictEqual(BD.envAt(t, 0, 20, 0).slick, 1);
  assert.strictEqual(BD.envAt(t, 0, 20, 0).ice, 0);
  assert.strictEqual(BD.envAt(t, 0, 30, 0).slick, 0);
  assert.strictEqual(BD.envAt({ ...t, theme: 'snow' }, 0, 20, 0).ice, 1);
});
test('stopPoints puts ring on the road edge and pet outside', () => {
  const s = BD.stopPoints(track, { i: 10, side: 1 });
  assert.ok(Math.abs(s.ring.x - -(1.9 - .4)) < 1e-9 && s.ring.z === 20);
  assert.ok(Math.abs(s.pet.x - -(1.9 + 1.6)) < 1e-9);
});
test('THEMES covers the four maps', () => {
  for (const k of ['country', 'snow', 'beach', 'night']) assert.ok(BD.THEMES[k].crossers.length && BD.THEMES[k].riders.length && BD.THEMES[k].hills.length === 4);
  assert.deepStrictEqual(BD.THEMES.snow.hills, [4, 5, 3.5, 5]);
});

// ---- Track generator ----
const { genTrack } = require('../server/games/blinddrive/track.js');
const THEME_NAMES = ['country', 'snow', 'beach', 'night'];

function segsIntersect(p1, p2, p3, p4) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

test('genTrack: 200 seeds x 4 themes x levels 0-5', () => {
  for (let seed = 1; seed <= 200; seed++) for (const theme of THEME_NAMES) for (let level = 0; level <= 5; level++) {
    const t = genTrack(theme, level, seed * 31 + level), pts = t.pts, n = pts.length;
    const tag = `${theme} L${level} seed ${seed}`;
    let len = 0;
    for (let k = 0; k < n - 1; k++) {
      const d = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      assert.ok(Math.abs(d - 2) <= .01, `${tag}: step ${k} is ${d}`);
      len += d;
    }
    assert.ok(Math.abs(len - Math.min(330, 180 + 30 * level)) <= 2, `${tag}: length ${len}`);
    for (let k = 0; k < n; k++) {
      const [a, b] = k < n - 1 ? [pts[k], pts[k + 1]] : [pts[k - 1], pts[k]];
      const sl = BD.slopeAlong(t.hills, pts[k][0], pts[k][1], Math.atan2(b[0] - a[0], b[1] - a[1]));
      assert.ok(Math.abs(sl) <= .22, `${tag}: slope ${sl} at ${k}`);
    }
    for (let k = 0; k < n - 1; k++) for (let m = k + 2; m < n - 1; m++) {
      if (Math.abs(pts[k][0] - pts[m][0]) > 4 || Math.abs(pts[k][1] - pts[m][1]) > 4) continue; // far apart
      assert.ok(!segsIntersect(pts[k], pts[k + 1], pts[m], pts[m + 1]), `${tag}: segments ${k} and ${m} cross`);
    }
  }
});

test('genTrack: objects spaced and placed', () => {
  const nearestI = (t, x, z) => { let bi = 0, bd = Infinity; t.pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  for (let seed = 1; seed <= 100; seed++) for (const theme of THEME_NAMES) for (let level = 0; level <= 5; level++) {
    const t = genTrack(theme, level, seed * 17 + level), n = t.pts.length, tag = `${theme} L${level} seed ${seed}`;
    assert.strictEqual(t.finishI, n - 6);
    assert.ok(Math.abs(t.rw - Math.max(1.5, 1.9 - .08 * level)) < 1e-9, `${tag}: rw`);
    assert.strictEqual(t.coins.length, 20);
    const rows = [0, 1, 2, 3].map(r => nearestI(t, t.coins[r * 5 + 2][0], t.coins[r * 5 + 2][1]));
    const slickN = theme === 'snow' ? 4 : 2;
    const items = [...t.stops.map(s => s.i), ...rows, ...t.slicks.map(s => nearestI(t, s.x, s.z)), ...t.crossers.map(c => c.i)];
    assert.strictEqual(t.stops.length, level >= 2 ? 4 : 3, `${tag}: stops`);
    assert.strictEqual(t.crossers.length, 2);
    // slicks may be reduced on the shortest tracks when 14 m spacing cannot fit them all
    assert.ok(t.slicks.length <= slickN && t.slicks.length >= 2, `${tag}: slicks ${t.slicks.length}`);
    if (level >= 1 || theme !== 'snow') assert.strictEqual(t.slicks.length, slickN, `${tag}: slicks`);
    for (const i of items) assert.ok(i >= 6 && i <= t.finishI - 5, `${tag}: object at ${i}`);
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++)
      assert.ok(Math.abs(items[a] - items[b]) * 2 >= 14, `${tag}: objects ${items[a]} and ${items[b]} too close`);
    for (const s of t.stops) { assert.ok(s.side === 1 || s.side === -1); assert.ok(BD.THEMES[theme].riders.includes(s.kind)); }
    for (const c of t.crossers) { assert.ok(BD.THEMES[theme].crossers.includes(c.kind)); assert.ok(c.spd >= 1.2 && c.spd <= 1.8 && c.ph >= 0 && c.ph <= 10); }
    for (const s of t.slicks) { assert.ok(s.rz >= 1.6 && s.rz <= 2.2 && s.rx >= 1 && s.rx <= t.rw); }
    const [hMin, hMax, h0, h1] = BD.THEMES[theme].hills;
    assert.ok(t.hills.length >= hMin && t.hills.length <= hMax);
    for (const h of t.hills) {
      assert.ok(h.s >= 8 && h.s <= 11.5 && h.h <= h1 + 1e-9 && h.h > 0);
      assert.ok(Math.hypot(h.x - t.pts[0][0], h.z - t.pts[0][1]) >= 20 && Math.hypot(h.x - t.pts[n - 1][0], h.z - t.pts[n - 1][1]) >= 20);
    }
  }
});

test('genTrack: same seed gives same track', () => {
  for (const theme of THEME_NAMES) assert.deepStrictEqual(genTrack(theme, 3, 12345), genTrack(theme, 3, 12345));
  assert.notDeepStrictEqual(genTrack('country', 0, 1).pts, genTrack('country', 0, 2).pts);
});

// ---- Task 4: game module pure rules ----
const G = require('../server/games/blinddrive/index.js');
const { balance, score, rank, validateMove } = G._test;
const mk = teams => teams.map((team, i) => ({ id: 'p' + i, team }));
const sizes = g => g.map(x => x.length);

test('balance: 2 unpicked -> one group of 2', () => {
  assert.deepStrictEqual(sizes(balance(mk([-1, -1]))).filter(Boolean), [2]);
});
test('balance: teams 0 and 3 -> one group of 2', () => {
  const g = balance(mk([0, 3]));
  assert.strictEqual(g.length, 4);
  assert.deepStrictEqual(sizes(g).filter(Boolean), [2]);
});
test('balance: 3 unpicked -> one group of 3', () => {
  assert.deepStrictEqual(sizes(balance(mk([-1, -1, -1]))).filter(Boolean), [3]);
});
test('balance: [0,0,1,1,-1] has no single', () => {
  const s = sizes(balance(mk([0, 0, 1, 1, -1]))).filter(Boolean).sort();
  assert.deepStrictEqual(s, [2, 3]);
});
test('balance: [0,1,1,1,2,2,2] all groups 2-3', () => {
  for (const s of sizes(balance(mk([0, 1, 1, 1, 2, 2, 2]))).filter(Boolean)) assert.ok(s >= 2 && s <= 3);
});
test('balance: 8 unpicked -> four groups of 2', () => {
  assert.deepStrictEqual(sizes(balance(mk(Array(8).fill(-1)))), [2, 2, 2, 2]);
});
test('balance: invalid teams treated as unassigned', () => {
  const g = balance([{ id: 'a', team: 9 }, { id: 'b', team: 'x' }, { id: 'c', team: 1.5 }]);
  assert.deepStrictEqual(sizes(g).filter(Boolean), [3]);
});
test('balance property: random picks', () => {
  for (let run = 0; run < 500; run++) {
    const n = 2 + (Math.random() * 7 | 0);
    const ps = mk(Array.from({ length: n }, () => (Math.random() * 5 | 0) - 1));
    const g = balance(ps);
    assert.strictEqual(g.length, 4);
    const ids = g.flat();
    assert.deepStrictEqual(ids.slice().sort(), ps.map(p => p.id).sort(), JSON.stringify(ps));
    for (const x of g) assert.ok(x.length === 0 || (x.length >= 2 && x.length <= 3), JSON.stringify(ps) + JSON.stringify(g));
  }
});
test('score', () => {
  assert.strictEqual(score({ place: 1, picked: 2, coins: 3 }), 530);
  assert.strictEqual(score({ place: null, picked: 1, coins: 0 }), 100);
  assert.strictEqual(score({ place: 4, picked: 0, coins: 0 }), 60);
  assert.strictEqual(score({ place: 5, picked: 0, coins: 0 }), 0);
});
test('rank shares equal total and firsts', () => {
  const r = rank([{ team: 0, total: 500, firsts: 1 }, { team: 1, total: 500, firsts: 2 }, { team: 2, total: 500, firsts: 2 }]);
  assert.deepStrictEqual(r.map(x => [x.team, x.rank]), [[1, 1], [2, 1], [0, 3]]);
});
test('validateMove', () => {
  const prev = { x: 0, z: 0, t: 1 };
  assert.ok(validateMove(prev, { x: .3, z: 0 }, 1.05));
  assert.ok(!validateMove(prev, { x: 3, z: 0 }, 1.05));
  assert.ok(!validateMove(prev, { x: NaN, z: 0 }, 1.05));
  assert.ok(!validateMove(prev, { x: 'a', z: 0 }, 1.05));
  assert.ok(!validateMove(prev, { x: '0.1', z: 0 }, 1.05));
  assert.ok(!validateMove(prev, { x: 0, z: Infinity }, 1.05));
  assert.ok(!validateMove(prev, { x: 0 }, 1.05));
  assert.ok(!validateMove(prev, null, 1.05));
  assert.ok(validateMove(null, { x: 1e6, z: -1e6 }, 1));
});
test('meta shape', () => {
  assert.strictEqual(G.meta.id, 'blinddrive');
  assert.deepStrictEqual(G.meta.teams, { count: 4, max: 3, names: ['Red', 'Blue', 'Green', 'Yellow'] });
  assert.deepStrictEqual(G.meta.settings.map(s => s.key), ['map', 'levels', 'delay']);
});

// ---- Task 5: game flow (fake api drives tick and messages) ----
const DT = .05;
function bdApi(teams, settings = {}) {
  const players = teams.map((team, i) => ({ id: i + 1, name: 'P' + (i + 1), av: i, team, connected: true }));
  const api = {
    settings: { map: 'country', levels: 2, delay: 0, ...settings },
    players: () => players.slice(),
    send: (p, d) => api.out.push({ to: p.id, d }),
    bcast: d => api.out.push({ to: 0, d }),
    end: w => api.ends.push(w),
    out: [], ends: [], list: players,
    p: id => players.find(q => q.id === id),
    msgs: (t, to) => api.out.filter(m => m.d.t === t && (to === undefined || m.to === to)).map(m => m.d),
    leave(g, id) { const i = players.findIndex(q => q.id === id); const [q] = players.splice(i, 1); g.onLeave(q); },
  };
  return api;
}
function newGame(teams, settings) { const api = bdApi(teams, settings); const g = G.create(api); g.start(); return { api, g }; }
const ticks = (g, n) => { for (let i = 0; i < n; i++) g.tick(DT); };
function until(g, cond, max = 20000) { for (let i = 0; i < max && !cond(); i++) g.tick(DT); assert.ok(cond(), 'condition never met'); }
const toRace = g => until(g, () => g.ph === 'race');
const lastSnap = api => api.msgs('s').at(-1);
const carOf = (api, team) => lastSnap(api).cars.find(c => c[0] === team);
const tp = (api, team) => lastSnap(api).tp.find(c => c[0] === team);
const teamById = (g, id) => g.teams.find(t => t.id === id);
// point s metres along the centre line and the heading there
function along(tr, s) {
  const p = tr.pts, f = Math.max(0, Math.min(p.length - 1.001, s / 2)), k = Math.floor(f), u = f - k;
  return { x: p[k][0] + (p[k + 1][0] - p[k][0]) * u, z: p[k][1] + (p[k + 1][1] - p[k][1]) * u, a: Math.atan2(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]) };
}
// put a team's car somewhere directly (as if its driver had been sending poses)
function place(g, id, x, z, v = 0) { const t = teamById(g, id); Object.assign(t.car, { x, z, v, t: g.clock }); t.seen = g.clock; }
const driverP = (g, api, id) => api.p(teamById(g, id).driver);
const sendCar = (g, api, id, pose) => g.onMsg(driverP(g, api, id), { t: 'car', v: 0, ...pose });

test('flow: ready -> count -> race -> result -> next level -> final -> end', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  const init1 = api.msgs('init', 1)[0];
  assert.strictEqual(init1.level, 1); assert.strictEqual(init1.levels, 2);
  assert.deepStrictEqual(init1.teams.map(t => [t.id, t.members, t.driver]), [[0, [1, 2], 1], [1, [3, 4], 3]]);
  assert.deepStrictEqual(init1.me, { team: 0, role: 'driver' });
  assert.deepStrictEqual(api.msgs('init', 2)[0].me, { team: 0, role: 'nav' });
  assert.strictEqual(init1.start.length, 2);
  const [s0, s1] = init1.start;
  assert.ok(Math.abs(Math.hypot(s0[1] - s1[1], s0[2] - s1[2]) - 1.2) < .02, 'teams 1.2 m apart');
  const phases = [];
  let guard = 0;
  while (!api.ends.length && guard++ < 20000) {
    if (g.ph === 'race') for (const t of g.teams) if (!t.place && t.id === 0) { const e = g.track.pts[g.track.finishI]; place(g, 0, e[0], e[1]); }
    g.tick(DT);
    const s = lastSnap(api);
    if (s && phases.at(-1) !== s.ph) phases.push(s.ph);
  }
  assert.deepStrictEqual(phases, ['ready', 'count', 'race', 'result', 'ready', 'count', 'race', 'result', 'final']);
  assert.deepStrictEqual(api.ends, [[1, 2]]);
  const init2 = api.msgs('init', 1)[1];
  assert.strictEqual(init2.level, 2);
  assert.deepStrictEqual(init2.teams.map(t => t.driver), [2, 4]);
  assert.deepStrictEqual(init2.me, { team: 0, role: 'nav' });
  assert.strictEqual(api.msgs('level').length, 2);
  const fin = api.msgs('final')[0];
  assert.deepStrictEqual(fin.rows.map(r => [r.team, r.rank, r.members]), [[0, 1, [1, 2]], [1, 2, [3, 4]]]);
  ticks(g, 100);
  assert.strictEqual(api.ends.length, 1);
});

test('race: driving to the finish ranks teams and scores', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  const tr = g.track, end = tr.finishI * 2 + 1;
  let sa = 2, sb = 2;
  for (let k = 0; k < 2000 && g.ph === 'race'; k++) {
    sa = Math.min(end, sa + .8); sb = Math.min(end, sb + .5); // within the 1.025 m per-tick move limit
    if (!teamById(g, 0).place) sendCar(g, api, 0, along(tr, sa));
    if (!teamById(g, 1).place) sendCar(g, api, 1, along(tr, sb));
    g.tick(DT);
  }
  assert.strictEqual(g.ph, 'result');
  const lv = api.msgs('level')[0];
  assert.strictEqual(lv.level, 1);
  const A = lv.rows.find(r => r.team === 0), B = lv.rows.find(r => r.team === 1);
  assert.strictEqual(A.place, 1); assert.strictEqual(B.place, 2);
  assert.strictEqual(A.points, 300 + A.picked * 100 + A.coins * 10);
  assert.strictEqual(B.points, 200 + B.picked * 100 + B.coins * 10);
  assert.strictEqual(A.total, A.points);
  assert.ok(A.coins > 0, 'centre-line coins picked');
  const fx = api.msgs('fx').filter(f => f.kind === 'finish');
  assert.deepStrictEqual(fx.map(f => [f.team, f.i]), [[0, 1], [1, 2]]);
});

test('race: same-tick finish', () => {
  { // larger index first
    const { api, g } = newGame([0, 0, 1, 1]);
    toRace(g);
    const p = g.track.pts, f = g.track.finishI;
    place(g, 0, p[f][0], p[f][1]); place(g, 1, p[f + 2][0], p[f + 2][1]);
    g.tick(DT);
    assert.strictEqual(teamById(g, 1).place, 1); assert.strictEqual(teamById(g, 0).place, 2);
    assert.deepStrictEqual(tp(api, 1).slice(0, 4), [1, 0, 0, 1]);
  }
  { // same index: smaller team id first
    const { g } = newGame([0, 0, 1, 1]);
    toRace(g);
    const p = g.track.pts, f = g.track.finishI;
    place(g, 1, p[f + 1][0], p[f + 1][1]); place(g, 0, p[f + 1][0], p[f + 1][1]);
    g.tick(DT);
    assert.strictEqual(teamById(g, 0).place, 1); assert.strictEqual(teamById(g, 1).place, 2);
  }
});

test('race: boarding needs 0.8 s slow inside the ring; coins picked once', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  const ring = BD.stopPoints(g.track, g.track.stops[0]).ring, P = g.track.pts, si = g.track.stops[0].i;
  const tl = Math.hypot(P[si + 1][0] - P[si][0], P[si + 1][1] - P[si][1]);
  const out = { x: ring.x + 3 * (P[si + 1][0] - P[si][0]) / tl, z: ring.z + 3 * (P[si + 1][1] - P[si][1]) / tl }; // 3 m along the road
  const hold = (n, v = 0, x = ring.x, z = ring.z) => { for (let k = 0; k < n; k++) { place(g, 0, x, z, v); g.tick(DT); } };
  hold(10, 1.5); // too fast: no progress
  assert.strictEqual(teamById(g, 0).picked, 0);
  hold(10); // .5 s
  hold(4, 0, out.x, out.z); // outside: decays at half speed -> .4 s
  hold(7); // .75 s
  assert.strictEqual(teamById(g, 0).picked, 0);
  hold(1); // .8 s
  assert.strictEqual(teamById(g, 0).picked, 1);
  assert.deepStrictEqual(api.msgs('fx').filter(f => f.kind === 'pick').map(f => [f.team, f.i]), [[0, 0]]);
  hold(40);
  assert.strictEqual(teamById(g, 0).picked, 1, 'a stop is picked once per team');
  assert.strictEqual(teamById(g, 1).picked, 0);
  assert.strictEqual(tp(api, 0)[1], 1);
  // coins
  const [cx, cz] = g.track.coins[0];
  place(g, 0, cx, cz); g.tick(DT); place(g, 0, cx, cz); g.tick(DT);
  assert.strictEqual(teamById(g, 0).coins, 1);
  assert.strictEqual(teamById(g, 1).coins, 0);
  place(g, 1, cx, cz); g.tick(DT);
  assert.strictEqual(teamById(g, 1).coins, 1, 'coins are per team');
  assert.deepStrictEqual(api.msgs('fx').filter(f => f.kind === 'coin').map(f => [f.team, f.i]), [[0, 0], [1, 0]]);
  assert.deepStrictEqual(tp(api, 0).slice(1, 3), [1, 1]);
});

test('race: off-road over 6 m spins out and sends fix; moves ignored for 2 s', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  ticks(g, 20); // 1 s so a long move is still valid
  const p = g.track.pts, a0 = Math.atan2(p[3][0] - p[2][0], p[3][1] - p[2][1]);
  const off = { x: p[2][0] - Math.cos(a0) * 7, z: p[2][1] + Math.sin(a0) * 7, a: a0 };
  sendCar(g, api, 0, off);
  assert.ok(Math.abs(teamById(g, 0).car.x - off.x) < 1e-9, 'move accepted');
  g.tick(DT);
  const fixes = api.msgs('fix', 1);
  assert.strictEqual(fixes.length, 1);
  const n = BD.nearestOnTrack(g.track, off.x, off.z).i;
  assert.deepStrictEqual([fixes[0].x, fixes[0].z, fixes[0].v], [p[n][0], p[n][1], 0]);
  assert.ok(Math.abs(fixes[0].a - Math.atan2(p[n + 1][0] - p[n][0], p[n + 1][1] - p[n][1])) < .001);
  assert.strictEqual(api.msgs('fix', 2).length, 0, 'fix only to the driver');
  assert.ok(api.msgs('fx').some(f => f.kind === 'spin' && f.team === 0));
  assert.strictEqual(carOf(api, 0)[5] & 1, 1);
  for (let k = 0; k < 38; k++) { sendCar(g, api, 0, { x: p[n][0] + .3, z: p[n][1], a: 0 }); g.tick(DT); }
  assert.deepStrictEqual(carOf(api, 0).slice(1, 3), [p[n][0], p[n][1]], 'pose frozen while spinning');
  assert.strictEqual(carOf(api, 0)[5] & 1, 1);
  ticks(g, 3);
  assert.strictEqual(carOf(api, 0)[5] & 1, 0, 'spin over after 2 s');
  // invulnerable for 1.3 s: off-road again does not spin
  sendCar(g, api, 0, { x: p[n][0] - Math.cos(a0) * 1, z: p[n][1] + Math.sin(a0) * 1, a: 0 });
  assert.notStrictEqual(teamById(g, 0).car.x, p[n][0]);
  teamById(g, 0).car.x -= 6.5; // 7.5 m from the centre line while invulnerable
  ticks(g, 2);
  assert.strictEqual(api.msgs('fix', 1).length, 1);
  ticks(g, 30); // invulnerability over
  assert.strictEqual(api.msgs('fix', 1).length, 2);
});

test('race: crosser hit spins out', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  const c = g.track.crossers[0];
  until(g, () => BD.crosserPos(g.track, c, g.lt + DT).onRoad);
  const q = BD.crosserPos(g.track, c, g.lt + DT);
  place(g, 0, q.x, q.z, 2);
  place(g, 1, q.x, q.z, .3); // slow: no hit
  g.tick(DT);
  assert.ok(teamById(g, 0).spin > 0);
  assert.strictEqual(teamById(g, 1).spin, 0);
  assert.strictEqual(api.msgs('fix', 1).length, 1);
  assert.ok(lastSnap(api).cr.length === g.track.crossers.length && lastSnap(api).cr[0].length === 3);
});

test('messages: garbage ignored', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  const drv = api.p(1), nav = api.p(2);
  g.onMsg(drv, { t: 'car', x: 5, z: 5, a: 0, v: 0 }); // during ready
  toRace(g);
  ticks(g, 2);
  const before = JSON.stringify(teamById(g, 0).car);
  const bad = [{}, { t: 'car' }, { t: 'car', x: NaN, z: 0, a: 0, v: 0 }, { t: 'car', x: '1', z: 0, a: 0, v: 0 }, { t: 'car', x: 0, z: Infinity, a: 0, v: 0 },
    { t: 'car', x: 0, z: 1, a: 'x', v: 0 }, { t: 'car', x: 0, z: 1, a: 0, v: null }, { t: 'nope' }, { t: 'car', x: [], z: {}, a: 0, v: 0 }];
  for (const d of bad) assert.doesNotThrow(() => g.onMsg(drv, d));
  g.onMsg(nav, { t: 'car', x: teamById(g, 0).car.x + .2, z: teamById(g, 0).car.z, a: 0, v: 0 }); // navigator
  g.onMsg({ id: 99 }, { t: 'car', x: 0, z: 0, a: 0, v: 0 }); // not a player in a team
  assert.strictEqual(JSON.stringify(teamById(g, 0).car), before);
  for (const k of [9, -1, '2', 1.5, null, undefined, NaN]) assert.doesNotThrow(() => g.onMsg(nav, { t: 'sig', k }));
  g.onMsg(drv, { t: 'sig', k: 1 }); // the driver cannot signal
  g.onMsg({ id: 99 }, { t: 'sig', k: 1 });
  assert.strictEqual(api.msgs('sig').length, 0);
  assert.strictEqual(api.msgs('sent').length, 0);
  g.onMsg(nav, { t: 'sig', k: 3 });
  g.onMsg(nav, { t: 'sig', k: 4 }); // too soon
  g.tick(DT);
  g.onMsg(nav, { t: 'sig', k: 5 }); // .05 s later: still too soon
  ticks(g, 3);
  g.onMsg(nav, { t: 'sig', k: 6 });
  assert.deepStrictEqual(api.msgs('sig', 1).map(s => [s.k, s.from]), [[3, 2], [6, 2]]);
  assert.deepStrictEqual(api.msgs('sent', 2).map(s => s.k), [3, 6]);
  assert.strictEqual(api.msgs('sig').length, 2, 'signals go only to the driver');
  // too-far move is dropped and answered with a fix of the old pose
  const c = teamById(g, 0).car, old = [c.x, c.z];
  g.onMsg(drv, { t: 'car', x: c.x + 30, z: c.z, a: 0, v: 0 });
  assert.deepStrictEqual([c.x, c.z], old);
  const fx = api.msgs('fix', 1).at(-1);
  assert.deepStrictEqual([fx.x, fx.z], old.map(v => Math.round(v * 100) / 100));
});

test('signals arrive after the delay setting', () => {
  const { api, g } = newGame([0, 0, 1, 1], { delay: .5 });
  toRace(g);
  g.onMsg(api.p(2), { t: 'sig', k: 2 });
  assert.deepStrictEqual(api.msgs('sent', 2).map(s => s.k), [2]);
  ticks(g, 9);
  assert.strictEqual(api.msgs('sig', 1).length, 0);
  ticks(g, 2);
  assert.deepStrictEqual(api.msgs('sig', 1).map(s => s.k), [2]);
});

test('stall: no car message for 1 s -> v 0 in snapshot', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  const c = teamById(g, 0).car;
  sendCar(g, api, 0, { x: c.x, z: c.z + .3, a: c.a, v: 5, g: 1 });
  ticks(g, 10);
  assert.strictEqual(carOf(api, 0)[4], 5);
  assert.strictEqual(carOf(api, 0)[5] & 2, 2, 'gas flag');
  ticks(g, 12);
  assert.strictEqual(carOf(api, 0)[4], 0);
  assert.strictEqual(carOf(api, 0)[5] & 6, 0, 'gas and brake flags cleared');
});

test('disconnect: driver offline 5 s -> teammate drives; rejoin -> navigator until next level', () => {
  const { api, g } = newGame([0, 0, 1, 1], { levels: 4 });
  toRace(g);
  const p1 = api.p(1);
  p1.connected = false; g.onDisconnect(p1);
  ticks(g, 90); // 4.5 s
  assert.strictEqual(teamById(g, 0).driver, 1);
  assert.strictEqual(api.msgs('roles').length, 0);
  ticks(g, 12);
  assert.strictEqual(teamById(g, 0).driver, 2);
  const r2 = api.msgs('roles', 2).at(-1);
  assert.deepStrictEqual(r2.teams.map(t => [t.id, t.driver]), [[0, 2], [1, 3]]);
  assert.deepStrictEqual(r2.me, { team: 0, role: 'driver' });
  assert.deepStrictEqual(api.msgs('roles', 3).at(-1).me, { team: 1, role: 'driver' });
  assert.strictEqual(api.msgs('fix', 2).length, 1, 'new driver gets the car pose');
  // the new driver can move the car
  const c = teamById(g, 0).car;
  sendCar(g, api, 0, { x: c.x, z: c.z + .4, a: c.a });
  assert.strictEqual(api.p(teamById(g, 0).driver).id, 2);
  // rejoin
  const nInit = api.msgs('init', 1).length;
  p1.connected = true; g.onRejoin(p1);
  const ri = api.msgs('init', 1);
  assert.strictEqual(ri.length, nInit + 1);
  assert.deepStrictEqual(ri.at(-1).me, { team: 0, role: 'nav' });
  assert.strictEqual(ri.at(-1).teams[0].driver, 2);
  assert.ok(api.out.at(-1).to === 1 && api.out.at(-1).d.t === 's', 'latest snapshot re-sent');
  ticks(g, 120);
  assert.strictEqual(teamById(g, 0).driver, 2, 'stays navigator for the rest of the level');
  // next levels rotate normally
  g.endLevel(); until(g, () => g.level === 2);
  assert.strictEqual(teamById(g, 0).driver, 2);
  g.endLevel(); until(g, () => g.level === 3);
  assert.strictEqual(teamById(g, 0).driver, 1);
  assert.deepStrictEqual(api.msgs('init', 1).at(-1).me, { team: 0, role: 'driver' });
});

test('leave: team down to 1 -> solo', () => {
  const { api, g } = newGame([0, 0, 1, 1, 1]);
  toRace(g);
  api.leave(g, 1);
  const t0 = teamById(g, 0);
  assert.deepStrictEqual([t0.members, t0.driver], [[2], 2]);
  assert.deepStrictEqual(api.msgs('roles', 2).at(-1).me, { team: 0, role: 'solo' });
  assert.strictEqual(api.msgs('fix', 2).length, 1);
  g.tick(DT);
  assert.strictEqual(api.ends.length, 0);
  // a navigator leaving a team of 3 keeps the driver
  api.leave(g, 4);
  assert.deepStrictEqual([teamById(g, 1).members, teamById(g, 1).driver], [[3, 5], 3]);
  g.endLevel(); until(g, () => g.level === 2);
  assert.deepStrictEqual(api.msgs('init', 2).at(-1).me, { team: 0, role: 'solo' });
  assert.strictEqual(teamById(g, 1).driver, 5);
  // whole team gone -> off the board
  api.leave(g, 2);
  g.tick(DT);
  assert.deepStrictEqual(g.teams.map(t => t.id), [1]);
  assert.deepStrictEqual(lastSnap(api).cars.map(c => c[0]), [1]);
});

test('fewer than 2 players in the room -> api.end([]); a disconnect alone does not end it', () => {
  { // disconnect: the seat is kept, the match goes on
    const { api, g } = newGame([-1, -1]);
    toRace(g);
    const p = api.p(2); p.connected = false; g.onDisconnect(p);
    ticks(g, 200); // 10 s
    assert.strictEqual(api.ends.length, 0);
    assert.strictEqual(g.over, false);
    // leaving for good (core removes the player before onLeave) ends it once
    api.leave(g, 2);
    assert.deepStrictEqual(api.ends, [[]]);
    ticks(g, 10);
    api.leave(g, 1);
    assert.strictEqual(api.ends.length, 1);
  }
  { // leave down to 1
    const { api, g } = newGame([0, 0, 1]);
    api.leave(g, 3);
    assert.strictEqual(api.ends.length, 0);
    api.leave(g, 2);
    assert.deepStrictEqual(api.ends, [[]]);
    ticks(g, 10);
    assert.strictEqual(api.ends.length, 1);
  }
});

test('everyone offline does not end the level early', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  toRace(g);
  for (const p of api.list) { p.connected = false; g.onDisconnect(p); }
  ticks(g, 100); // 5 s
  assert.strictEqual(g.ph, 'race');
  assert.strictEqual(api.msgs('level').length, 0);
  assert.strictEqual(api.ends.length, 0);
});

test('a player offline at start is still balanced into a team', () => {
  const api = bdApi([-1, -1, -1, -1]);
  api.p(3).connected = false;
  const g = G.create(api); g.start();
  assert.deepStrictEqual(g.teams.map(t => t.members), [[1, 2], [3, 4]]);
  assert.deepStrictEqual(api.msgs('init', 3)[0].me, { team: 1, role: 'nav' });
  // the offline player is the rotated driver (members[0]), so the online teammate drives
  assert.strictEqual(g.teamOf(3).driver, 4);
});

test('all members of a team offline -> it does not hold up the level end', () => {
  { // another connected team still racing: ends AFTER_FIRST after the first finish
    const { api, g } = newGame([0, 0, 1, 1, 2, 2]);
    for (const id of [5, 6]) { api.p(id).connected = false; g.onDisconnect(api.p(id)); }
    toRace(g);
    const e = g.track.pts[g.track.finishI];
    place(g, 0, e[0], e[1]); g.tick(DT);
    assert.strictEqual(g.ph, 'race');
    assert.strictEqual(lastSnap(api).fin, 20);
    ticks(g, 390);
    assert.strictEqual(g.ph, 'race');
    ticks(g, 15);
    assert.strictEqual(g.ph, 'result');
  }
  { // the finishing team is the only one with a connected member: ends now
    const { api, g } = newGame([0, 0, 1, 1, 2, 2]);
    for (const id of [3, 4, 5, 6]) { api.p(id).connected = false; g.onDisconnect(api.p(id)); }
    toRace(g);
    const e = g.track.pts[g.track.finishI];
    place(g, 0, e[0], e[1]); g.tick(DT);
    assert.strictEqual(g.ph, 'result');
    const lv = api.msgs('level')[0];
    assert.deepStrictEqual(lv.rows.map(r => [r.team, r.place]), [[0, 1], [1, null], [2, null]]);
  }
});

test('snapshot shape and timers', () => {
  const { api, g } = newGame([0, 0, 1, 1]);
  g.tick(DT);
  let s = lastSnap(api);
  assert.deepStrictEqual(Object.keys(s).sort(), ['cars', 'cr', 'fin', 'ph', 't', 'tm', 'tp']);
  assert.strictEqual(s.ph, 'ready'); assert.strictEqual(s.tm, 3); assert.strictEqual(s.fin, null);
  const init = api.msgs('init', 1)[0];
  assert.deepStrictEqual(s.cars.map(c => c.slice(0, 4)), init.start);
  toRace(g);
  ticks(g, 41);
  s = lastSnap(api);
  assert.strictEqual(s.ph, 'race'); assert.strictEqual(s.tm, 2);
  assert.deepStrictEqual(s.tp.map(r => r.slice(0, 4)), [[0, 0, 0, null], [1, 0, 0, null]]);
});

test('random map never repeats the previous level', () => {
  const { g } = newGame([0, 0, 1, 1], { map: 'random', levels: 6 });
  let prev = g.track.theme;
  for (let k = 0; k < 5; k++) { g.endLevel(); until(g, () => g.level === k + 2); assert.notStrictEqual(g.track.theme, prev); prev = g.track.theme; }
});

test('genTrack: short BD_FAST tracks keep every object on the road', () => {
  for (let seed = 1; seed <= 30; seed++) for (const theme of Object.keys(BD.THEMES)) for (let level = 0; level <= 5; level++) {
    const t = genTrack(theme, level, seed, { len: 60 }), tag = `${theme} L${level} seed ${seed}`;
    for (const i of [...t.stops.map(s => s.i), ...t.crossers.map(c => c.i)]) assert.ok(i >= 6 && i <= t.finishI - 5, `${tag}: object at ${i}`);
    assert.strictEqual(t.stops.length, level >= 2 ? 4 : 3);
    for (const st of t.stops) { const r = BD.stopPoints(t, st).ring; assert.ok(Number.isFinite(r.x) && Number.isFinite(r.z)); }
  }
  // default lengths are unchanged by the squeeze: object indices recorded from the generator before the fix (b956fbc)
  const fp = t => [...t.stops.map(s => s.i), ...t.crossers.map(c => c.i), ...t.slicks.map(s => s.x)];
  assert.deepStrictEqual([['country', 0, 7], ['snow', 0, 11], ['night', 5, 3]].map(([th, l, sd]) => fp(genTrack(th, l, sd))),
    [[14, 59, 66, 6, 22, -12.54, -42.07], [13, 28, 80, 21, 66, 5.88, 9.86], [127, 134, 146, 154, 6, 55, -24.22, 35.88]]);
});

test('BD_FAST: a full match runs on short tracks and ends', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const G = require(${JSON.stringify(require.resolve('../server/games/blinddrive'))});
    const ps = [1, 2, 3, 4].map((id, i) => ({ id, team: i >> 1, connected: true }));
    let ended = null;
    const api = { settings: { map: 'random', levels: 2, delay: 0 }, players: () => ps, send() {}, bcast() {}, end: w => { ended = w; } };
    const g = G.create(api); g.start();
    for (let k = 0; k < 3000 && !ended; k++) {
      if (g.ph === 'race') { const t = g.teams[0], e = g.track.pts[g.track.finishI]; Object.assign(t.car, { x: e[0], z: e[1] }); t.seen = g.clock; }
      g.tick(.05);
    }
    process.stdout.write(JSON.stringify({ ended, len: g.track.pts.length, clock: Math.round(g.clock) }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, BD_FAST: '1' } }).toString());
  assert.deepStrictEqual(out.ended, [1, 2]);
  assert.strictEqual(out.len, 31);
  assert.ok(out.clock < 40, `fast match took ${out.clock} s`);
});
