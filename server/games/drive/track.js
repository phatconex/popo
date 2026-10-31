// Lái Mò — sinh đường đua ngẫu nhiên theo từng bản đồ.
// Đường luôn đi "lên" (y giảm) nên không bao giờ tự cắt nhau.
const THEMES = {
  country: { name: 'Đồng quê', crossers: [1, 2], riders: [0, 2, 3, 4, 5] },
  snow: { name: 'Đèo tuyết', crossers: [6, 10], riders: [6, 7, 8, 9] },
  beach: { name: 'Phố biển', crossers: [11, 12], riders: [11, 13, 14, 15] },
  night: { name: 'Phố đêm', crossers: [4, 5], riders: [0, 1, 2, 3, 5] },
};
const THEME_IDS = Object.keys(THEMES);
const STEP = 24; // khoảng cách giữa 2 điểm trên đường

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function genTrack(theme, lv) {
  const seed = Math.random() * 1e9 | 0, R = mulberry(seed);
  const T = THEMES[theme];
  const len = 4200 + lv * 700;
  const rw = Math.max(56, 74 - lv * 4); // nửa bề rộng đường
  const n = Math.round(len / STEP);

  // hướng đi: lệch khỏi "thẳng lên" trong khoảng ±75°, đổi dần theo từng đoạn cua
  let x = 0, y = 0, h = 0, target = 0, segLeft = 0;
  const raw = [[x, y]];
  for (let i = 0; i < n; i++) {
    if (--segLeft <= 0) {
      segLeft = 6 + R() * 14 | 0;
      target = i < 6 ? 0 : (R() < .25 ? 0 : (R() * 2 - 1) * (0.7 + lv * .08));
      target = Math.max(-1.3, Math.min(1.3, target));
    }
    h += (target - h) * 0.18;
    x += Math.sin(h) * STEP; y -= Math.cos(h) * STEP;
    raw.push([x, y]);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of raw) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
  const M = 500;
  const pts = raw.map(([px, py]) => [Math.round(px - minX + M), Math.round(py - minY + M)]);
  const W = Math.round(maxX - minX + M * 2), H = Math.round(maxY - minY + M * 2);
  const last = pts.length - 1;

  const dir = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const at = (i, off) => { const a = dir(i) + Math.PI / 2; return [pts[i][0] + Math.cos(a) * off, pts[i][1] + Math.sin(a) * off]; };

  // chỗ đã dùng (theo chỉ số điểm) để vật cản không chồng lên nhau
  const used = new Set();
  const free = (i, r) => { for (let k = i - r; k <= i + r; k++) if (used.has(k)) return false; return true; };
  const take = (i, r) => { for (let k = i - r; k <= i + r; k++) used.add(k); };
  const spot = (lo, hi, r) => {
    for (let t = 0; t < 40; t++) { const i = lo + (R() * (hi - lo) | 0); if (free(i, r)) { take(i, r); return i; } }
    return -1;
  };
  take(0, 8); take(last - 4, 4);

  // trạm đón khách: chia đều trên đường
  const nStops = Math.min(5, 3 + (lv >> 1));
  const stops = [];
  for (let s = 0; s < nStops; s++) {
    const i = Math.round(last * (s + 1) / (nStops + 1) + (R() - .5) * last * .08);
    const side = R() < .5 ? -1 : 1;
    take(i, 5);
    const [sx, sy] = at(i, side * (rw - 22)), [ax, ay] = at(i, side * (rw + 34));
    stops.push({ i, side, x: Math.round(sx), y: Math.round(sy), ax: Math.round(ax), ay: Math.round(ay), kind: T.riders[R() * T.riders.length | 0] });
  }
  const crossers = [];
  for (let c = 0; c < 3 + lv; c++) {
    const i = spot(14, last - 10, 4); if (i < 0) continue;
    crossers.push({ i, kind: T.crossers[R() * T.crossers.length | 0], ang: dir(i) + Math.PI / 2, spd: 34 + R() * 22 + lv * 4, ph: R() * 10 });
  }
  const cones = [];
  for (let c = 0; c < 5 + lv; c++) {
    const i = spot(12, last - 8, 3); if (i < 0) continue;
    const off = (R() < .5 ? -1 : 1) * rw * (.15 + R() * .5);
    for (let k = 0; k < 2 + (R() * 2 | 0); k++) {
      const [cx, cy] = at(Math.min(last, i + k), off + (R() - .5) * 16);
      cones.push([Math.round(cx), Math.round(cy)]);
    }
  }
  const slicks = [];
  for (let c = 0; c < 3 + lv; c++) {
    const i = spot(10, last - 8, 3); if (i < 0) continue;
    const [sx, sy] = at(i, (R() - .5) * rw * .8);
    slicks.push([Math.round(sx), Math.round(sy), Math.round(48 + R() * 26), Math.round(28 + R() * 14), +dir(i).toFixed(2)]);
  }
  const coins = [];
  for (let c = 0; c < 9; c++) {
    const i = spot(8, last - 6, 2); if (i < 0) continue;
    const off = (R() - .5) * rw;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j > 0 && j < last) { const [cx, cy] = at(j, off); coins.push([Math.round(cx), Math.round(cy)]); } }
  }
  return { theme, lv, seed, W, H, rw, pts, stops, crossers, cones, slicks, coins, time: Math.round(len / 120 + nStops * 6 + 15) };
}

module.exports = { THEMES, THEME_IDS, genTrack };
