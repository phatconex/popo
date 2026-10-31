// Sinh bản đồ cho Trốn Tìm. Mỗi chủ đề có khung cố định (nhà, ao, khu đất),
// còn cây/bụi/đồ vật được rải ngẫu nhiên mỗi ván. Client tự vẽ theo `theme`.
//   buildings/seas: hình chữ nhật chặn đường; ponds: hình elip chặn đường
//   patches: khu trang trí (ruộng, sân bóng…), paths: đường đi (chỉ trang trí)
//   trees/bushes: vẽ đè lên thú — chỗ để trốn
//   kinds: bộ thú của bản đồ (mã con vật, xem ANIMAL_NAMES ở public/core/art.js)
const THEMES = {
  farm: {
    W: 3200, H: 2200, kinds: [0, 1, 2, 3, 4, 5],
    buildings: [[150, 110, 300, 230], [2720, 1820, 300, 230]],
    ponds: [[2350, 560, 270, 165], [850, 1680, 230, 145], [1700, 1120, 160, 105]],
    patches: [[700, 260, 520, 300], [1450, 1720, 600, 280], [2600, 1080, 420, 380], [260, 900, 360, 420]],
    count: { trees: 62, bushes: 40, props: 16, rocks: 24 },
  },
  snow: {
    W: 3000, H: 2200, kinds: [6, 7, 8, 9, 10],
    buildings: [[140, 120, 250, 210], [2560, 260, 250, 210], [1320, 1820, 250, 210]],
    ponds: [[1500, 820, 330, 200], [560, 1500, 250, 150], [2420, 1560, 270, 170]],
    patches: [[720, 230, 440, 280], [2000, 1080, 380, 330], [260, 720, 330, 320]],
    count: { trees: 78, bushes: 30, props: 22, rocks: 20 },
  },
  beach: {
    W: 3400, H: 2000, sea: 1560, kinds: [11, 12, 13, 14, 15],
    buildings: [[150, 110, 230, 190], [1560, 130, 230, 190], [2980, 520, 230, 190]],
    ponds: [[900, 920, 230, 135], [2420, 1080, 210, 125]],
    patches: [[620, 300, 440, 260], [1900, 680, 440, 300], [1280, 1230, 520, 230], [2720, 1180, 400, 250]],
    count: { trees: 48, bushes: 30, props: 30, rocks: 18 },
  },
};
const THEME_IDS = Object.keys(THEMES);

function mulberry(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function blocked(m, x, y, pad = 10) {
  for (const b of m.buildings) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  for (const s of m.seas) if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
  for (const p of m.ponds) { const dx = (x - p.cx) / (p.rx + pad), dy = (y - p.cy) / (p.ry + pad); if (dx * dx + dy * dy < 1) return true; }
  return false;
}

function genMap(theme) {
  const T = THEMES[theme];
  const seed = Math.random() * 1e9 | 0, r = mulberry(seed);
  const j = (v, a = 120) => Math.round(v + (r() - .5) * a);
  const m = {
    theme, seed, W: T.W, H: T.H, kinds: T.kinds,
    buildings: T.buildings.map(([x, y, w, h], i) => ({ x: i ? j(x, 100) : x, y: i ? j(y, 100) : y, w, h })),
    seas: T.sea ? [{ x: 0, y: T.sea, w: T.W, h: T.H - T.sea }] : [],
    ponds: T.ponds.map(([cx, cy, rx, ry]) => ({ cx: j(cx), cy: j(cy), rx, ry })),
    patches: T.patches.map(([x, y, w, h], i) => ({ x: j(x), y: j(y), w, h, kind: i })),
    paths: [], trees: [], bushes: [], props: [], rocks: [],
  };
  const b0 = m.buildings[0];
  m.spawn = { x: b0.x + b0.w / 2, y: b0.y + b0.h + 60 };

  // đường đi: từ cửa mỗi ngôi nhà về quảng trường giữa, thêm vài nhánh ra mép bản đồ
  const hub = [j(T.W * .5, 300), j((T.sea || T.H) * .5, 200)];
  const bend = (a, b) => [(a[0] + b[0]) / 2 + (r() - .5) * 400, (a[1] + b[1]) / 2 + (r() - .5) * 300];
  for (const b of m.buildings) { const door = [b.x + b.w / 2, b.y + b.h + 20]; m.paths.push([door, bend(door, hub), hub]); }
  const edges = [[T.W - 40, j(T.H * .3, 300)], [j(T.W * .3, 400), (T.sea ? T.sea + 40 : T.H - 30)], [40, j(T.H * .65, 300)]];
  for (const e of edges) m.paths.push([hub, bend(hub, e), e]);

  const inPatch = (x, y, pad) => m.patches.some(f => x > f.x - pad && x < f.x + f.w + pad && y > f.y - pad && y < f.y + f.h + pad);
  const place = (arr, n, minD, pad, others) => {
    for (let tries = 0; arr.length < n && tries < n * 60; tries++) {
      const x = 90 + r() * (m.W - 180), y = 120 + r() * (m.H - 200);
      if (blocked(m, x, y, pad) || inPatch(x, y, pad * .6) || Math.hypot(x - m.spawn.x, y - m.spawn.y) < 120) continue;
      if (arr.some(o => Math.hypot(o[0] - x, o[1] - y) < minD) || others.some(o => Math.hypot(o[0] - x, o[1] - y) < minD * .7)) continue;
      arr.push([x | 0, y | 0, r() * 4 | 0]);
    }
  };
  place(m.trees, T.count.trees, 165, 90, []);
  place(m.bushes, T.count.bushes, 110, 50, m.trees);
  place(m.props, T.count.props, 150, 40, [...m.trees, ...m.bushes]);
  place(m.rocks, T.count.rocks, 90, 30, [...m.trees, ...m.props]);
  return m;
}

module.exports = { genMap, blocked, THEME_IDS };
