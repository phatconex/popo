'use strict';
// Bonk Island: island layout, surfaces and break schedule. Pure module: no timers, no I/O.
// All randomness goes through the `rand` argument (a function returning [0, 1)).
const BK = require('../../../public/games/bonk3d/shared.js');

const T = { count: 3, first: 15, every: 12, warn: 3, hold: 20, single: 4, pause: 6, final: 12 };
const FAST_T = { count: 1, first: 3, every: 3, warn: 1, hold: 3, single: 1, pause: 2, final: 3 };
const MAPS = ['beach', 'snow', 'farm'];
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const TAU = Math.PI * 2;
const MUD = { 3: 4, 4: 6, 5: 8 };

const ringsFor = (n) => (n <= 4 ? 3 : n <= 8 ? 4 : 5);
const key = (q, r) => q + ',' + r;
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const angleOf = (q, r) => { const [x, z] = BK.hexToXZ(q, r); return Math.atan2(z, x); };

function growIce(tiles, target, rand) {
  const inIsland = new Set(tiles.map((t) => key(t.q, t.r)));
  const cand = tiles.filter((t) => t.ring > 0);
  const ice = new Set();
  const seeds = 3 + Math.floor(rand() * 3);
  for (const t of shuffle(cand, rand).slice(0, seeds)) ice.add(key(t.q, t.r));
  while (ice.size < target) {
    const frontier = [];
    for (const k of ice) {
      const [q, r] = k.split(',').map(Number);
      for (const [dq, dr] of DIRS) {
        const nk = key(q + dq, r + dr);
        if (inIsland.has(nk) && !ice.has(nk) && nk !== '0,0') frontier.push(nk);
      }
    }
    if (!frontier.length) break;
    ice.add(pick(frontier, rand));
  }
  return ice;
}

function makeBreaks(rings, tiles, rand, TT) {
  const breaks = [];
  let k = 0, lastDrop = 0;
  for (let rg = rings; rg >= 2; rg--) {
    const start = rand() * TAU;
    const sorted = tiles.filter((t) => t.ring === rg)
      .map((t) => ({ t, a: (((angleOf(t.q, t.r) - start) % TAU) + TAU) % TAU }))
      .sort((x, y) => x.a - y.a).map((x) => x.t);
    const cut = Math.ceil(sorted.length / 2);
    for (const half of [sorted.slice(0, cut), sorted.slice(cut)]) {
      const warnAt = TT.first + k * TT.every;
      lastDrop = warnAt + TT.warn;
      for (const t of half) breaks.push([t.q, t.r, warnAt, lastDrop]);
      k++;
    }
  }
  const ring1 = tiles.filter((t) => t.ring === 1)
    .sort((a, b) => angleOf(a.q, a.r) - angleOf(b.q, b.r));
  const warn0 = lastDrop + TT.hold;
  ring1.forEach((t, i) => {
    const warnAt = warn0 + i * TT.single;
    breaks.push([t.q, t.r, warnAt, warnAt + TT.warn]);
  });
  return breaks;
}

function makeSpawns(n, rings, obst) {
  const rad = 0.6 * BK.islandRadius(rings);
  const centres = obst.map(([q, r]) => BK.hexToXZ(q, r));
  const build = (a0) => Array.from({ length: n }, (_, i) => {
    const a = a0 + (i * TAU) / n;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    return [x, z, Math.atan2(-x, -z)];
  });
  const clearance = (sp) => Math.min(...sp.flatMap(([x, z]) => centres.map(([ox, oz]) => Math.hypot(x - ox, z - oz))));
  let best = null, bestC = -1;
  for (let a0 = 0; a0 < TAU; a0 += 0.1) {
    const sp = build(a0), c = clearance(sp);
    if (c >= 1) return sp;
    if (c > bestC) { best = sp; bestC = c; }
  }
  return best; // unreachable in practice: 63 rotations always leave a clear one
}

function makeIsland({ n, map, rand, T: TT = T }) {
  const rings = ringsFor(n);
  const tiles = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      const rg = BK.ring(q, r);
      if (rg <= rings) tiles.push({ q, r, ring: rg, surf: 0 });
    }
  }
  const r2 = tiles.filter((t) => t.ring === 2);
  const o = pick(r2, rand);
  const obst = [[o.q, o.r], [-o.q, -o.r]];
  const obstKeys = new Set(obst.map(([q, r]) => key(q, r)));

  const surf = [];
  if (map === 'snow') {
    const ice = growIce(tiles, Math.round(0.4 * tiles.length), rand);
    for (const t of tiles) if (ice.has(key(t.q, t.r))) { t.surf = 1; surf.push([t.q, t.r, 1]); }
  } else if (map === 'farm') {
    const ok = tiles.filter((t) => t.ring > 0 && t.ring < rings && !obstKeys.has(key(t.q, t.r)));
    for (const t of shuffle(ok, rand).slice(0, MUD[rings])) { t.surf = 2; surf.push([t.q, t.r, 2]); }
  }

  return {
    map, rings, tiles, obst, surf,
    spawn: makeSpawns(n, rings, obst),
    breaks: makeBreaks(rings, tiles, rand, TT),
  };
}

// 'random' picks one random permutation of the 3 maps and returns perm[roundIndex % 3], so any 3
// consecutive rounds contain all 3 maps. Stateless in roundIndex. Any other value is a fixed map.
function mapPicker(setting, rand) {
  if (setting !== 'random') return () => setting;
  const perm = shuffle(MAPS, rand);
  return (roundIndex) => perm[roundIndex % 3];
}

module.exports = { T, FAST_T, ringsFor, makeIsland, mapPicker, tileState: BK.tileState };
