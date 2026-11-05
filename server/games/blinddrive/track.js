// Blind Drive track generator: a seeded random road with hills, stops, coins, slicks and crossers.
const BD = require('../../../public/games/blinddrive3d/shared.js');

const STEP = 2;                       // metres between track points
const MAX_TURN = 75 * Math.PI / 180;  // heading limit relative to the start direction
const GAP = 7;                        // minimum index gap between objects (14 m)
const r2 = v => Math.round(v * 100) / 100;

function genTrack(theme, level, seed, opts = {}) {
  const rnd = BD.rng(seed), T = BD.THEMES[theme];
  const len = opts.len ?? Math.min(330, 180 + 30 * level);
  const rw = Math.max(1.5, 1.9 - .08 * level);
  const segs = Math.round(len / STEP), n = segs + 1;
  const finishI = n - 6;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const range = (a, b) => a + rnd() * (b - a);

  // Centre line. Straight for the first 12 m and the last 10 m; each step rounds relative to the previous
  // rounded point so every segment stays within 2 +- .01 m.
  const pts = [[0, 0]];
  let a = 0, da = 0;
  for (let k = 0; k < segs; k++) {
    if (k >= 6 && k < segs - 5) {
      da = Math.max(-.09, Math.min(.09, da * .9 + (rnd() - .5) * .06));
      a += da;
      const lim = MAX_TURN - .02;
      if (a > lim) { a = lim; da = -Math.abs(da) * .5; } else if (a < -lim) { a = -lim; da = Math.abs(da) * .5; }
    }
    const p = pts[k];
    pts.push([r2(p[0] + r2(STEP * Math.sin(a))), r2(p[1] + r2(STEP * Math.cos(a)))]);
  }
  const headingAt = k => {
    const [p, q] = k < n - 1 ? [pts[k], pts[k + 1]] : [pts[k - 1], pts[k]];
    return Math.atan2(q[0] - p[0], q[1] - p[1]);
  };

  // Hills centred on track points, at least 20 m from start and finish.
  const [hMin, hMax, h0, h1] = T.hills;
  const hillCount = hMin + Math.floor(rnd() * (hMax - hMin + 1));
  const first = pts[0], last = pts[n - 1];
  const cand = [];
  for (let k = 0; k < n; k++) {
    if (Math.hypot(pts[k][0] - first[0], pts[k][1] - first[1]) >= 20 && Math.hypot(pts[k][0] - last[0], pts[k][1] - last[1]) >= 20) cand.push(k);
  }
  const hills = [];
  for (let k = 0; k < hillCount && cand.length; k++) {
    const p = pts[pick(cand)];
    hills.push({ x: p[0], z: p[1], h: r2(range(h0, h1)), s: r2(range(8, 11.5)) });
  }
  const slopeOk = () => pts.every((p, k) => Math.abs(BD.slopeAlong(hills, p[0], p[1], headingAt(k))) <= .22);
  for (let guard = 0; !slopeOk() && guard < 200; guard++) for (const h of hills) h.h = r2(h.h * .9);

  // Objects: one shuffled sequence spread over indices 6 .. finishI - 5 with at least GAP between neighbours.
  const stopN = level >= 2 ? 4 : 3, wantSlicks = theme === 'snow' ? 4 : 2;
  const lo = 6, hi = finishI - 5;
  const capacity = Math.floor((hi - lo) / GAP) + 1;
  const slickN = Math.max(0, Math.min(wantSlicks, capacity - stopN - 4 - 2)); // only trims on very short tracks
  const kinds = [];
  for (let k = 0; k < stopN; k++) kinds.push('stop');
  for (let k = 0; k < 4; k++) kinds.push('coin');
  for (let k = 0; k < slickN; k++) kinds.push('slick');
  kinds.push('crosser', 'crosser');
  for (let k = kinds.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
  const slack = Math.max(0, (hi - lo) - (kinds.length - 1) * GAP);
  const cuts = Array.from({ length: kinds.length }, () => Math.floor(rnd() * (slack + 1))).sort((x, y) => x - y);
  const stops = [], coinRows = [], slicks = [], crossers = [];
  const riders = T.riders.slice();
  for (let k = riders.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [riders[k], riders[j]] = [riders[j], riders[k]]; }
  kinds.forEach((kind, k) => {
    const i = lo + k * GAP + cuts[k];
    if (kind === 'stop') stops.push({ i, side: rnd() < .5 ? -1 : 1, kind: riders[stops.length % riders.length] });
    else if (kind === 'coin') coinRows.push(i);
    else if (kind === 'slick') slicks.push({ x: pts[i][0], z: pts[i][1], rx: Math.min(rw, r2(range(1, rw))), rz: r2(range(1.6, 2.2)), a: r2(headingAt(i)) });
    else crossers.push({ i, kind: pick(T.crossers), ph: r2(range(0, 10)), spd: r2(range(1.2, 1.8)) });
  });

  // Coins: rows of 5, 1.4 m apart along the centre line, centred on pts[i].
  const pointAt = s => { // s = metres along the polyline
    const f = Math.max(0, Math.min(n - 1.0001, s / STEP)), k = Math.floor(f), u = f - k;
    return [r2(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u), r2(pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u)];
  };
  const coins = [];
  for (const i of coinRows.sort((x, y) => x - y)) for (let c = -2; c <= 2; c++) coins.push(pointAt(i * STEP + c * 1.4));

  stops.sort((x, y) => x.i - y.i); crossers.sort((x, y) => x.i - y.i);
  return { seed, theme, level, rw, pts, hills, stops, coins, slicks, crossers, finishI };
}

module.exports = { genTrack };
