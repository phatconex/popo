// Hide & Seek map generator. Each theme has a fixed frame (houses, ponds, patches) and random
// trees / bushes / props / landmarks every round. The browser builds the 3D world from this data.
//   buildings / seas: blocking rectangles · ponds: blocking ellipses
//   patches: decorated areas (fields, gardens…) · paths: dirt paths (decoration only)
//   trees: hiding spots that block with TREE_R · bushes: hiding spots you can walk through
//   props: [x, y, variant, r] — r > 0 blocks with that radius · rocks: small decoration
//   landmarks: big blocking props { type, x, y, r, rot }
//   kinds: animal codes for this map (see public/core3d/animals.js)
const S = 1.5; // map scale vs. the 2D version
const TREE_R = 30;
const PROP_R = 38;

const sc = list => list.map(a => a.map(v => Math.round(v * S)));
const THEMES = {
  farm: {
    W: 4800, H: 3300, kinds: [0, 3, 4, 1, 6, 5],
    buildings: sc([[150, 110, 300, 230], [2720, 1820, 300, 230]]),
    ponds: sc([[2350, 560, 270, 165], [850, 1680, 230, 145], [1700, 1120, 160, 105]]),
    patches: sc([[700, 260, 520, 300], [1450, 1720, 600, 280], [2600, 1080, 420, 380], [260, 900, 360, 420]]),
    count: { trees: 112, bushes: 72, props: 30, rocks: 44 },
    landmarks: [['windmill', 130, 1], ['watermill', 120, 1], ['stall', 80, 2], ['cart', 65, 2], ['well', 60, 1], ['tent', 85, 2]],
  },
  snow: {
    W: 4500, H: 3300, kinds: [7, 8, 2, 18, 20],
    buildings: sc([[140, 120, 250, 210], [2560, 260, 250, 210], [1320, 1820, 250, 210]]),
    ponds: sc([[1500, 820, 330, 200], [560, 1500, 250, 150], [2420, 1560, 270, 170]]),
    patches: sc([[720, 230, 440, 280], [2000, 1080, 380, 330], [260, 720, 330, 320]]),
    count: { trees: 141, bushes: 54, props: 40, rocks: 36 },
    landmarks: [['snowman', 55, 4], ['tree-decorated', 70, 2], ['train', 120, 1], ['sled', 60, 2], ['snow-pile', 70, 3]],
  },
  beach: {
    W: 5100, H: 3000, sea: Math.round(1560 * S), kinds: [11, 12, 13, 10, 15],
    buildings: sc([[150, 110, 230, 190], [1560, 130, 230, 190], [2980, 520, 230, 190]]),
    ponds: sc([[900, 920, 230, 135], [2420, 1080, 210, 125]]),
    patches: sc([[620, 300, 440, 260], [1900, 680, 440, 300], [1280, 1230, 520, 230], [2720, 1180, 400, 250]]),
    count: { trees: 87, bushes: 54, props: 54, rocks: 32 },
    landmarks: [['tower', 110, 1], ['wreck', 140, 1], ['boat', 75, 3], ['flag', 40, 2], ['crates', 60, 3]],
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
  const near = (ox, oy, r) => { const dx = x - ox, dy = y - oy, rr = r + pad; return dx * dx + dy * dy < rr * rr; };
  for (const t of m.trees) if (near(t[0], t[1], TREE_R)) return true;
  for (const p of m.props) if (p[3] > 0 && near(p[0], p[1], p[3])) return true;
  for (const l of m.landmarks) if (near(l.x, l.y, l.r)) return true;
  return false;
}

function genMap(theme) {
  const T = THEMES[theme];
  const seed = Math.random() * 1e9 | 0, r = mulberry(seed);
  const j = (v, a = 180) => Math.round(v + (r() - .5) * a);
  const m = {
    theme, seed, W: T.W, H: T.H, kinds: T.kinds,
    buildings: T.buildings.map(([x, y, w, h], i) => ({ x: i ? j(x, 150) : x, y: i ? j(y, 150) : y, w, h })),
    seas: T.sea ? [{ x: 0, y: T.sea, w: T.W, h: T.H - T.sea }] : [],
    ponds: T.ponds.map(([cx, cy, rx, ry]) => ({ cx: j(cx), cy: j(cy), rx, ry })),
    patches: T.patches.map(([x, y, w, h], i) => ({ x: j(x), y: j(y), w, h, kind: i })),
    paths: [], trees: [], bushes: [], props: [], rocks: [], landmarks: [],
  };
  const b0 = m.buildings[0];
  m.spawn = { x: b0.x + b0.w / 2, y: b0.y + b0.h + 90 };

  // paths: from every house door to the central square, plus a few branches to the map edge
  const hub = [j(T.W * .5, 450), j((T.sea || T.H) * .5, 300)];
  const bend = (a, b) => [(a[0] + b[0]) / 2 + (r() - .5) * 600, (a[1] + b[1]) / 2 + (r() - .5) * 450];
  for (const b of m.buildings) { const door = [b.x + b.w / 2, b.y + b.h + 30]; m.paths.push([door, bend(door, hub), hub]); }
  const edges = [[T.W - 60, j(T.H * .3, 450)], [j(T.W * .3, 600), (T.sea ? T.sea + 60 : T.H - 45)], [60, j(T.H * .65, 450)]];
  for (const e of edges) m.paths.push([hub, bend(hub, e), e]);

  const inPatch = (x, y, pad) => m.patches.some(f => x > f.x - pad && x < f.x + f.w + pad && y > f.y - pad && y < f.y + f.h + pad);
  const nearHub = (x, y, d) => Math.hypot(x - hub[0], y - hub[1]) < d || Math.hypot(x - m.spawn.x, y - m.spawn.y) < d;
  const free = (x, y, pad) => !blocked(m, x, y, pad) && !inPatch(x, y, pad * .6) && !nearHub(x, y, 180);
  const place = (arr, n, minD, pad, others, make) => {
    for (let tries = 0; arr.length < n && tries < n * 80; tries++) {
      const x = 120 + r() * (m.W - 240), y = 160 + r() * (m.H - 280);
      if (!free(x, y, pad)) continue;
      if (arr.some(o => Math.hypot((o.x ?? o[0]) - x, (o.y ?? o[1]) - y) < minD) || others.some(o => Math.hypot((o.x ?? o[0]) - x, (o.y ?? o[1]) - y) < minD * .7)) continue;
      arr.push(make(x | 0, y | 0));
    }
  };
  // landmarks first (they are the biggest)
  for (const [type, rad, n] of T.landmarks) {
    const list = [];
    place(list, n, 500, rad + 60, m.landmarks, (x, y) => ({ type, x, y, r: rad, rot: +(r() * Math.PI * 2).toFixed(2) }));
    m.landmarks.push(...list);
  }
  place(m.trees, T.count.trees, 150, 80, m.landmarks, (x, y) => [x, y, r() * 4 | 0]);
  place(m.bushes, T.count.bushes, 110, 50, m.trees, (x, y) => [x, y, r() * 4 | 0]);
  place(m.props, T.count.props, 150, 50, [...m.trees, ...m.bushes], (x, y) => [x, y, r() * 4 | 0, PROP_R]);
  place(m.rocks, T.count.rocks, 90, 30, [...m.trees, ...m.props], (x, y) => [x, y, r() * 4 | 0]);
  return m;
}

module.exports = { genMap, blocked, THEME_IDS, TREE_R };
