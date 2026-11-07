const test = require('node:test');
const assert = require('node:assert');
const BK = require('../public/games/bonk3d/shared.js');
const { T, FAST_T, ringsFor, makeIsland, mapPicker, tileState } = require('../server/games/bonk/island');

const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mk = (n, map, seed = 1, TT = T) => makeIsland({ n, map, rand: mulberry32(seed), T: TT });
const key = (q, r) => q + ',' + r;

test('ringsFor boundaries', () => {
  for (const [n, k] of [[2, 3], [4, 3], [5, 4], [8, 4], [9, 5], [12, 5]]) assert.strictEqual(ringsFor(n), k, 'n=' + n);
});

test('tile counts 37 / 61 / 91', () => {
  assert.strictEqual(mk(3, 'beach').tiles.length, 37);
  assert.strictEqual(mk(6, 'beach').tiles.length, 61);
  assert.strictEqual(mk(10, 'beach').tiles.length, 91);
});

test('tileState re-exported from shared', () => {
  assert.strictEqual(tileState, BK.tileState);
  assert.strictEqual(tileState([0, 0, 5, 8], 4), 'ok');
  assert.strictEqual(tileState([0, 0, 5, 8], 5), 'warn');
  assert.strictEqual(tileState([0, 0, 5, 8], 8), 'drop');
});

test('rings 4 schedule with T', () => {
  const isl = mk(6, 'beach');
  assert.strictEqual(isl.rings, 4);
  assert.strictEqual(isl.breaks.length, 60);
  assert.ok(!isl.breaks.some(([q, r]) => q === 0 && r === 0));
  assert.ok(isl.breaks.every((b) => b[3] - b[2] === 3));
  const times = [...new Set(isl.breaks.map((b) => b[2]))].sort((a, b) => a - b);
  assert.deepStrictEqual(times, [15, 27, 39, 51, 63, 75, 98, 102, 106, 110, 114, 118]);
  // each half is one contiguous arc
  for (const t of times.slice(0, 6)) {
    const half = isl.breaks.filter((b) => b[2] === t);
    const rg = BK.ring(half[0][0], half[0][1]);
    assert.ok(half.every((b) => BK.ring(b[0], b[1]) === rg));
    const all = isl.tiles.filter((x) => x.ring === rg).map((x) => {
      const [px, pz] = BK.hexToXZ(x.q, x.r);
      return { k: key(x.q, x.r), a: Math.atan2(pz, px) };
    }).sort((a, b) => a.a - b.a);
    const inHalf = new Set(half.map((b) => key(b[0], b[1])));
    const flags = all.map((x) => inHalf.has(x.k));
    let changes = 0;
    for (let i = 0; i < flags.length; i++) if (flags[i] !== flags[(i + 1) % flags.length]) changes++;
    assert.ok(changes <= 2, 'arc contiguous');
  }
  const singles = isl.breaks.filter((b) => b[2] >= 98);
  assert.strictEqual(singles.length, 6);
  assert.ok(singles.every((b) => BK.ring(b[0], b[1]) === 1));
});

test('last single warnAt: rings 3 -> 94, rings 5 -> 142', () => {
  const last = (isl) => Math.max(...isl.breaks.map((b) => b[2]));
  assert.strictEqual(last(mk(3, 'beach')), 94);
  assert.strictEqual(last(mk(10, 'beach')), 142);
});

test('FAST_T rings 3 ends before c=30', () => {
  const isl = mk(3, 'beach', 1, FAST_T);
  assert.ok(Math.max(...isl.breaks.map((b) => b[3])) < 30);
});

test('snow ice ratio, farm mud, beach none', () => {
  for (const n of [3, 6, 10]) for (let seed = 1; seed <= 20; seed++) {
    const s = mk(n, 'snow', seed);
    assert.ok(s.surf.length && s.surf.every((x) => x[2] === 1));
    const ratio = s.surf.length / s.tiles.length;
    assert.ok(ratio >= 0.35 && ratio <= 0.45, `ratio ${ratio}`);
    assert.ok(!s.surf.some(([q, r]) => q === 0 && r === 0));
    assert.ok(s.tiles.every((t) => t.surf === (s.surf.some(([q, r]) => q === t.q && r === t.r) ? 1 : 0)));
    const f = mk(n, 'farm', seed);
    const want = { 3: 4, 4: 6, 5: 8 }[f.rings];
    assert.strictEqual(f.surf.length, want);
    const ob = new Set(f.obst.map(([q, r]) => key(q, r)));
    for (const [q, r, k] of f.surf) {
      assert.strictEqual(k, 2);
      assert.ok(BK.ring(q, r) >= 1 && BK.ring(q, r) < f.rings && !ob.has(key(q, r)));
    }
    assert.strictEqual(mk(n, 'beach', seed).surf.length, 0);
  }
});

test('obstacles are ring-2 opposites', () => {
  const isl = mk(6, 'beach', 3);
  const [[a, b], [c, d]] = isl.obst;
  assert.strictEqual(BK.ring(a, b), 2);
  assert.deepStrictEqual([c, d], [-a, -b]);
});

test('spawns', () => {
  for (const n of [2, 5, 8, 12]) for (let seed = 1; seed <= 15; seed++) {
    const isl = mk(n, 'beach', seed);
    assert.strictEqual(isl.spawn.length, n);
    const byKey = new Map(isl.breaks.map((b) => [key(b[0], b[1]), b]));
    for (const [x, z, f] of isl.spawn) {
      const [q, r] = BK.xzToHex(x, z);
      assert.ok(isl.tiles.some((t) => t.q === q && t.r === r), 'on a tile');
      const b = byKey.get(key(q, r));
      assert.ok(!b || tileState(b, 0) === 'ok');
      for (const [oq, or] of isl.obst) {
        const [ox, oz] = BK.hexToXZ(oq, or);
        assert.ok(Math.hypot(x - ox, z - oz) >= 1, 'obstacle distance');
      }
      let d = f - Math.atan2(-x, -z);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      assert.ok(Math.abs(d) < 0.01);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(Math.hypot(isl.spawn[i][0] - isl.spawn[j][0], isl.spawn[i][1] - isl.spawn[j][1]) >= 1);
    }
  }
});

test('mapPicker', () => {
  const rand = mulberry32(7);
  const pick = mapPicker('random', rand);
  assert.deepStrictEqual(new Set([0, 1, 2].map(pick)), new Set(['beach', 'snow', 'farm']));
  const p2 = mapPicker('random', mulberry32(9));
  let prev = null;
  for (let i = 0; i < 30; i++) { const m = p2(i); assert.notStrictEqual(m, prev); prev = m; }
  const ps = mapPicker('snow', rand);
  for (let i = 0; i < 5; i++) assert.strictEqual(ps(i), 'snow');
});
