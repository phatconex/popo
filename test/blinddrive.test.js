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
