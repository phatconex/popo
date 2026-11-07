// Bonk Island world for one round: the hex island (tile columns, foam, ice and mud), the rolling sea or lake,
// the scenery out on the water, clouds and the ghost cloud. Tile states follow the server's break schedule on the
// client round clock (spec §2.3, §2.6). Map tables live in THEMES; everything else is shared by the three maps.
import * as THREE from 'three';
import { makeScene } from '../../core3d/engine.js';
import { prop, fitted, brighten } from '../../core3d/assets.js';

const BK = window.BK;
const { S, WATER_Y } = BK;
const TAU = Math.PI * 2;

// Spec §2.6. Model entries are [path, height in m] or [path, 0, width in m] (fitted by footprint).
export const THEMES = {
  beach: {
    sky: '#8fd8ff', hemi: '#4fb0d8', water: '#1f97d4',
    top: ['#86d862', '#8fdf6b', '#7fd05c'], edge: ['#f6e2a4', '#f0d995'], col: '#c99566',
    obst: [['pirate/palm-bend.glb', 2.9], ['pirate/palm-straight.glb', 3.1]],
    decor: [['nature/flower_redA.glb', .36], ['nature/flower_yellowA.glb', .36], ['nature/flower_purpleA.glb', .36], ['nature/grass.glb', .32], ['nature/grass_large.glb', .32]],
    far: 'islets',
    islet: { top: ['#f6e2a4', '#f0d995'], col: '#c99566', trees: [['pirate/palm-straight.glb', 3.6], ['nature/tree_palmTall.glb', 3.6], ['pirate/palm-bend.glb', 3.3]] },
  },
  snow: {
    sky: '#bfe6ff', hemi: '#8fc0e0', water: '#1a6fae',
    top: ['#f4f8ff', '#edf3fc', '#f8fbff'], edge: ['#e6eef9', '#e0e9f6'], ice: '#bfe9ff', col: '#9fb3c8',
    obst: [['holiday/snowman.glb', 1.5], ['holiday/tree-snow-a.glb', 2.7]],
    decor: [['holiday/present-a-cube.glb', .3], ['holiday/candy-cane-red.glb', .45], ['holiday/snow-pile.glb', .28], ['holiday/rocks-small.glb', .22]],
    far: 'islets', floes: true,
    islet: { top: ['#f4f8ff', '#e8f0fa'], col: '#9fb3c8', trees: [['platformer/tree-pine-snow.glb', 3.2], ['holiday/tree-snow-b.glb', 2.6], ['holiday/tree-snow-c.glb', 2.2]] },
  },
  farm: {
    sky: '#8fd8ff', hemi: '#4fa8a0', water: '#2a9fc4',
    top: ['#7cc957', '#76c251', '#83d05e'], edge: ['#e8cf7a', '#e2c76f'], mud: '#7a5232', col: '#b9875a',
    obst: [['nature/tree_oak.glb', 2.8], ['nature/log_stack.glb', 0, .9]],
    decor: [['nature/crop_pumpkin.glb', .34], ['nature/crop_carrot.glb', .3], ['nature/crops_cornStageD.glb', .7], ['nature/flower_redA.glb', .36], ['nature/flower_yellowA.glb', .36]],
    far: 'shore', lily: 'nature/lily_large.glb',
    shore: { grass: '#78c452', bank: '#d9c08a', hills: ['#6dbb4c', '#79c656', '#64b244'], trees: [['nature/tree_oak.glb', 3.2], ['nature/tree_default.glb', 3]] },
  },
};
const WARN = new THREE.Color('#ff4d5e');
// Models Hide & Seek also retints with brighten(): retint them here too so both games show them the same way
// whichever loads first. Every nature/ model must be brightened (see core3d/assets.js) — except the lily pad, which
// Hide & Seek shows untinted: Bonk tones its own copies of the lily's materials (toneLily) and leaves the cache alone.
const TONED = /^(nature|pirate|platformer)\/|^holiday\/(rocks-small|snow-pile)\.glb$/;
const toneNature = c => c.offsetHSL(0, .1, 0).multiplyScalar(.3); // brighten()'s default for nature/ models

function mulberry(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Height of the rolling water at (x, z): the same function moves the sea vertices and the floating things.
const waveH = (x, z, t) => Math.sin(x * .33 + t * 1.2) * .08 + Math.cos(z * .29 + t * .9) * .08;

// round: the server's `round` message. quality: engine.quality.
export async function buildWorld(round, quality) {
  const T = THEMES[round.map] || THEMES.beach, rings = round.rings, mobile = !!(quality && quality.mobile), shadows = !!(quality && quality.shadows);
  const o0 = round.obst[0] || [0, 0];
  const rnd = mulberry(round.rd * 7919 + rings * 131 + o0[0] * 17 + o0[1] * 29 + 1);
  const scene = makeScene({ sky: T.sky, fog: [55, 150], ground: T.hemi });
  const own = []; // geometries and materials made here (model clones share the loader's cache and are left alone)
  const keep = x => (own.push(x), x);
  const lambert = c => keep(new THREE.MeshLambertMaterial({ color: c }));
  const R = BK.islandRadius(rings);

  const paths = [...T.obst, ...T.decor, ...(T.islet ? T.islet.trees : []), ...(T.shore ? T.shore.trees : [])].map(m => m[0]);
  await Promise.all([...new Set(paths)].filter(p => TONED.test(p)).map(p => brighten(p)));
  const model = (m, opts) => (m[1] ? prop(m[0], m[1], opts) : fitted(m[0], m[2], opts));

  // ---- sea or lake: a gently rolling low-poly plane plus a flat one out to the horizon ----
  const seg = mobile ? 40 : 64;
  const wg = keep(new THREE.PlaneGeometry(110, 110, seg, seg)); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, keep(new THREE.MeshLambertMaterial({ color: T.water, flatShading: true })));
  water.position.y = WATER_Y; water.receiveShadow = shadows; scene.add(water);
  const wpos = wg.attributes.position, wbase = Float32Array.from(wpos.array);
  if (T.far !== 'shore') {
    const far = new THREE.Mesh(keep(new THREE.PlaneGeometry(800, 800)), lambert(T.water));
    far.rotation.x = -Math.PI / 2; far.position.y = WATER_Y - .12; scene.add(far);
  }

  // ---- island: hex columns (cap + tapered dirt column + foam ring at the waterline) ----
  const capGeo = keep(new THREE.CylinderGeometry(S * .975, S * .975, .24, 6)); capGeo.translate(0, -.12, 0);
  const colGeo = keep(new THREE.CylinderGeometry(S * .93, S * .55, 3.2, 6)); colGeo.translate(0, -.24 - 1.6, 0);
  const foamGeo = keep(new THREE.CircleGeometry(S * 1.2, 6)); foamGeo.rotateX(-Math.PI / 2); foamGeo.rotateY(Math.PI / 6);
  const foamMat = keep(new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: .8, depthWrite: false }));
  const colMat = lambert(T.col);
  const glintGeo = keep(new THREE.PlaneGeometry(.75, .06)); glintGeo.rotateX(-Math.PI / 2);
  const glintMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .6, depthWrite: false }));
  const puddleGeo = keep(new THREE.CircleGeometry(1, 14)); puddleGeo.rotateX(-Math.PI / 2);
  const puddleMat = keep(new THREE.MeshPhongMaterial({ color: '#5c3b22', shininess: 90, specular: '#6b5a4a' }));
  const surf = new Map(round.surf.map(([q, r, s]) => [q + ',' + r, s]));
  const brk = new Map(round.breaks.map(b => [b[0] + ',' + b[1], b]));
  const obstKeys = new Set(round.obst.map(([q, r]) => q + ',' + r));
  const tiles = [], tileMap = new Map();
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) {
    const ring = BK.ring(q, r); if (ring > rings) continue;
    const [x, z] = BK.hexToXZ(q, r), k = q + ',' + r, sf = surf.get(k) || 0;
    const pal = sf === 1 ? [T.ice] : sf === 2 ? [T.mud] : ring === rings ? T.edge : T.top;
    const base = pal[(((q * 5 + r * 11) % pal.length) + pal.length) % pal.length];
    const capM = keep(sf ? new THREE.MeshPhongMaterial({ color: base, shininess: sf === 1 ? 80 : 55, specular: sf === 1 ? '#ffffff' : '#8a7a6a' }) : new THREE.MeshLambertMaterial({ color: base }));
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const cap = new THREE.Mesh(capGeo, capM), col = new THREE.Mesh(colGeo, colMat), foam = new THREE.Mesh(foamGeo, foamMat);
    cap.receiveShadow = col.receiveShadow = shadows; foam.position.y = WATER_Y + .1;
    g.add(cap, col, foam);
    if (sf === 1) { // ice: two bright streaks
      const a = rnd() * TAU;
      for (const d of [-.16, .14]) { const s = new THREE.Mesh(glintGeo, glintMat); s.rotation.y = a; s.position.set(Math.cos(a + Math.PI / 2) * d, .004, -Math.sin(a + Math.PI / 2) * d); s.scale.x = d < 0 ? 1 : .6; g.add(s); }
    } else if (sf === 2) { // mud: a few wet puddles
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(puddleGeo, puddleMat), a = rnd() * TAU, rr = rnd() * .45; p.position.set(Math.cos(a) * rr, .004, Math.sin(a) * rr); p.scale.set(.18 + rnd() * .16, 1, .12 + rnd() * .1); p.rotation.y = rnd() * TAU; g.add(p); }
    }
    scene.add(g);
    const t = { q, r, ring, x, z, d: Math.hypot(x, z), g, capM, base: new THREE.Color(base), surf: sf, brk: brk.get(k) || null, vis: 'ok', spin: (rnd() - .5) * 1.4, splashed: false };
    tiles.push(t); tileMap.set(k, t);
  }
  const jobs = [];
  // obstacles (they ride their tile down when it drops)
  round.obst.forEach(([q, r], i) => {
    const t = tileMap.get(q + ',' + r); if (!t) return;
    const ry = rnd() * TAU;
    jobs.push(model(T.obst[i % T.obst.length]).then(o => { o.rotation.y = ry; t.g.add(o); }));
  });
  // decoration on plain tiles (never on obstacles, ice or mud; not blocking)
  for (const t of tiles) {
    if (obstKeys.has(t.q + ',' + t.r) || t.surf || rnd() > (mobile ? .4 : .55)) continue;
    const n = 1 + (rnd() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const m = T.decor[rnd() * T.decor.length | 0], a = rnd() * TAU, rr = .25 + rnd() * .5, ry = rnd() * TAU;
      jobs.push(model(m, { shadow: false }).then(o => { o.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); o.rotation.y = ry; t.g.add(o); }));
    }
  }

  // ---- scenery out on the water (the camera sees the sides and the far side of the island) ----
  const floaters = [], spinners = [];
  const hexCol = (top, col, y) => { // a small hex column like the island's, for islets
    const g = new THREE.Group(), c = new THREE.Mesh(capGeo, top), cc = new THREE.Mesh(colGeo, col), fo = new THREE.Mesh(foamGeo, foamMat);
    c.position.y = cc.position.y = y; fo.position.y = WATER_Y + .1; g.add(c, cc, fo); return g;
  };
  if (T.far === 'islets') {
    const I = T.islet, tops = I.top.map(lambert), col = lambert(I.col);
    const spots = [[3.0, 6.5], [-2.5, 9], [-1.75, 10.5], [-.95, 8.5], [.35, 6.5], [-3.1, 16], [-.35, 15]];
    for (const [a, dd] of spots) {
      const d = R + dd + rnd() * 1.5, g = new THREE.Group(); g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.rotation.y = rnd() * TAU;
      const big = dd > 12, cells = big ? [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] : [[0, 0], [1, 0], [0, 1], [-1, 1]].slice(0, 2 + (rnd() * 3 | 0));
      for (const [q, r] of cells) { const [hx, hz] = BK.hexToXZ(q, r), c = hexCol(tops[((q + r) & 1) % tops.length], col, -.5); c.position.set(hx, 0, hz); g.add(c); }
      const nt = big ? 3 : 1 + (rnd() * 2 | 0);
      for (let i = 0; i < nt; i++) {
        const m = I.trees[rnd() * I.trees.length | 0], [q, r] = cells[i % cells.length], [hx, hz] = BK.hexToXZ(q, r), s = .85 + rnd() * .3, ry = rnd() * TAU;
        const px = hx + (rnd() - .5) * .6, pz = hz + (rnd() - .5) * .6;
        jobs.push(prop(m[0], m[1] * s, { shadow: false }).then(o => { o.position.set(px, -.5, pz); o.rotation.y = ry; g.add(o); }));
      }
      scene.add(g);
    }
  }
  if (T.floes) { // drifting ice floes
    const top = lambert('#eef6ff'), side = lambert('#bcdcf2');
    for (let i = 0; i < (mobile ? 8 : 12); i++) {
      const n = 5 + (rnd() * 3 | 0), r0 = .6 + rnd() * 1.1, geo = keep(new THREE.CylinderGeometry(r0, r0 * .92, .28, n));
      const ks = Array.from({ length: n }, () => .8 + rnd() * .35), pos = geo.attributes.position; // uneven corners, the same for cap and side
      for (let v = 0; v < pos.count; v++) { const x = pos.getX(v), z = pos.getZ(v); if (Math.abs(x) + Math.abs(z) < 1e-6) continue; const k = ks[Math.round(((Math.atan2(x, z) + TAU) % TAU) / (TAU / n)) % n]; pos.setX(v, x * k); pos.setZ(v, z * k); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, [side, top, side]); m.receiveShadow = shadows;
      floaters.push({ o: m, a: rnd() * TAU, d: R + 2.2 + rnd() * 13, sp: (rnd() < .5 ? -1 : 1) * (.006 + rnd() * .01), ry: (rnd() - .5) * .2, y: .02, ph: rnd() * TAU });
      scene.add(m);
    }
  }
  if (T.far === 'shore') { // a lake: grass shore, hills, a windmill and a watermill
    const Sh = T.shore, L = R + 5; // small enough that the shore frames the sides of a landscape screen
    const shoreGeo = keep(new THREE.RingGeometry(L, 400, 22, 1)); jag(shoreGeo, L, rnd); shoreGeo.rotateX(-Math.PI / 2);
    const shore = new THREE.Mesh(shoreGeo, lambert(Sh.grass)); shore.position.y = WATER_Y + .26; shore.receiveShadow = shadows; scene.add(shore);
    const bankGeo = keep(new THREE.RingGeometry(L - 1.3, L + 1.5, 22, 1)); jag(bankGeo, L - 1.3, rnd); bankGeo.rotateX(-Math.PI / 2);
    const bank = new THREE.Mesh(bankGeo, lambert(Sh.bank)); bank.position.y = WATER_Y + .1; scene.add(bank);
    const hillGeo = keep(new THREE.IcosahedronGeometry(1, 1)), hillMats = Sh.hills.map(c => keep(new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
    const hill = (a, d, r0, k) => {
      const h = new THREE.Mesh(hillGeo, hillMats[(rnd() * hillMats.length) | 0]); h.scale.set(r0, r0 * k, r0 * (.8 + rnd() * .3));
      h.position.set(Math.cos(a) * d, WATER_Y + .2, Math.sin(a) * d); h.rotation.y = rnd() * TAU; h.receiveShadow = shadows; scene.add(h);
      return h;
    };
    for (let i = 0; i < 12; i++) hill(-Math.PI - .5 + (Math.PI + 1) * (i / 11) + (rnd() - .5) * .2, L + 6 + rnd() * 9, 2.6 + rnd() * 3, .4 + rnd() * .2);
    // the windmill on its own hill behind the island to the left (a portrait screen sees the far side, a landscape one
    // its corner), the watermill on the right shore (seen from a landscape screen)
    const ma = -2.15, wa = -.15, mh = hill(ma, L + 1.8, 2.4, .45);
    jobs.push(windmill(1.1, keep, lambert).then(w => { w.position.set(mh.position.x, mh.position.y + mh.scale.y * .85, mh.position.z); w.rotation.y = Math.atan2(-mh.position.x, -mh.position.z); scene.add(w); spinners.push(w.userData); }));
    const wd = L - .2; // the house stands on the bank with its wheel (local +x) turned to the lake
    jobs.push(watermill(1.2, keep, lambert).then(w => { w.position.set(Math.cos(wa) * wd, WATER_Y + .26, Math.sin(wa) * wd); w.rotation.y = Math.PI - wa; scene.add(w); spinners.push(w.userData); }));
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI - .4 + (Math.PI + .8) * rnd(), d = L + 2.5 + rnd() * 6, m = Sh.trees[i % Sh.trees.length], s = .8 + rnd() * .4, ry = rnd() * TAU;
      if (Math.abs(a - wa) < .3 || Math.abs(a - ma) < .3) continue;
      jobs.push(prop(m[0], m[1] * s, { shadow: false }).then(o => { o.position.set(Math.cos(a) * d, WATER_Y + .26, Math.sin(a) * d); o.rotation.y = ry; scene.add(o); }));
    }
    const lilyMats = new Map(); // cached material -> our toned copy (disposed with the round)
    const toneLily = o => o.traverse(m => {
      if (!m.isMesh) return;
      const tone = mt => { if (!lilyMats.has(mt)) { const c = keep(mt.clone()); if (c.color) toneNature(c.color); lilyMats.set(mt, c); } return lilyMats.get(mt); };
      m.material = Array.isArray(m.material) ? m.material.map(tone) : tone(m.material);
    });
    for (let i = 0; i < (mobile ? 9 : 14); i++) { // lily pads
      const f = { o: null, a: rnd() * TAU, d: R + 1.4 + rnd() * (L - R - 2.6), sp: (rnd() < .5 ? -1 : 1) * (.002 + rnd() * .004), ry: (rnd() - .5) * .1, y: .02, ph: rnd() * TAU };
      const s = .7 + rnd() * .5, ry = rnd() * TAU;
      jobs.push(fitted(T.lily, s, { shadow: false }).then(o => {
        toneLily(o);
        o.children[0].position.y -= new THREE.Box3().setFromObject(o).min.y; // the model is centred on its origin: lift the pad onto the water
        o.rotation.y = ry; f.o = o; scene.add(o); floaters.push(f);
      }));
    }
  }

  // ---- clouds and the ghost cloud ----
  const cloudMat = lambert('#ffffff'), sphGeo = keep(new THREE.SphereGeometry(1, 10, 8));
  const cloud = (n, sc, rows = 1) => {
    const g = new THREE.Group();
    for (let row = 0; row < rows; row++) for (let i = 0; i < n - row * 2; i++) {
      const m = new THREE.Mesh(sphGeo, cloudMat), s = (.9 + rnd() * .7) * sc;
      m.scale.set(s * 1.25, s * .8, s); m.position.set((i - (n - row * 2 - 1) / 2) * 1.05 * sc, (rnd() * .3 + row * .2) * sc, ((rnd() - .5) * .8 - row * .8) * sc); g.add(m);
    }
    return g;
  };
  const sky = [];
  for (let i = 0; i < 6; i++) {
    const c = cloud(4 + (i % 3), 1.8); c.position.set(-50 + i * 20 + rnd() * 6, 7 + (i % 3) * 2, -(R + 10 + (i % 2) * 12 + rnd() * 4));
    scene.add(c); sky.push(c);
  }
  const ghostCloud = cloud(7, .9, 2);
  // seats for knocked-out players on top of the cloud: front row from the middle out, then two rows behind (12)
  ghostCloud.userData.seats = [[0, .9, .3], [-.95, .88, .32], [.95, .88, .32], [-1.9, .8, .25], [1.9, .8, .25],
    [-.5, 1.1, -.4], [.5, 1.1, -.4], [-1.45, 1.02, -.4], [1.45, 1.02, -.4], [0, 1.3, -1.05], [-.95, 1.25, -1.05], [.95, 1.25, -1.05]];
  scene.add(ghostCloud);

  await Promise.all(jobs);

  // ---- per frame ----
  let clock = -Infinity;
  const gone = (t, c) => !!t.brk && BK.tileState(t.brk, c) === 'drop';
  const world = {
    scene, ghostCloud, rings, map: round.map,
    onSplash: null, // (x, z, size) — set by the client to show a splash when a dropped tile hits the water
    // -1 when (x, z) has no tile or its tile has dropped, otherwise the surface: 0 plain, 1 ice, 2 mud.
    solidAt(x, z, c = clock) {
      const [q, r] = BK.xzToHex(x, z), t = tileMap.get(q + ',' + r);
      return !t || gone(t, c) ? -1 : t.surf;
    },
    // Radius of what is left of the island (centre to the far corner of the outermost standing tile).
    radius(c = clock) { let m = 0; for (const t of tiles) if (!gone(t, c)) m = Math.max(m, t.d); return m + S; },
    // Obstacle centres still standing at clock c: [[x, z], ...] (for BK.hitObstacles).
    obstacles(c = clock) { return round.obst.map(([q, r]) => tileMap.get(q + ',' + r)).filter(t => t && !gone(t, c)).map(t => [t.x, t.z]); },
    update(dt, t, c) {
      clock = c;
      for (let i = 0; i < wpos.count; i++) wpos.array[i * 3 + 1] = waveH(wbase[i * 3], wbase[i * 3 + 2], t);
      wpos.needsUpdate = true;
      for (const tl of tiles) stepTile(tl, t, c);
      for (const f of floaters) {
        f.a += f.sp * dt; const x = Math.cos(f.a) * f.d, z = Math.sin(f.a) * f.d;
        f.o.position.set(x, WATER_Y + waveH(x, z, t) + f.y, z); f.o.rotation.y += f.ry * dt; f.o.rotation.z = Math.sin(t * .9 + f.ph) * .03;
      }
      for (const c2 of sky) { c2.position.x += dt * .6; if (c2.position.x > 70) c2.position.x = -70; }
      for (const s of spinners) s.spin.rotation[s.axis] += dt * s.speed;
    },
    dispose() {
      for (const x of own) x.dispose();
      own.length = 0;
      const sun = scene.userData.sun; // a new scene every round: free its shadow map too
      if (sun && sun.shadow && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
  };
  function stepTile(tl, t, c) {
    const st = tl.brk ? BK.tileState(tl.brk, c) : 'ok';
    if (st === 'ok') {
      if (tl.vis !== 'ok') { tl.vis = 'ok'; tl.g.visible = true; tl.g.position.set(tl.x, 0, tl.z); tl.g.rotation.set(0, 0, 0); tl.capM.color.copy(tl.base); tl.splashed = false; }
      return;
    }
    if (st === 'warn') { // pulse red faster and faster, shake, sink .12 m
      const e = c - tl.brk[2], w = tl.brk[3] - tl.brk[2] || 1, k = .5 + .5 * Math.sin(t * (14 + e * 6));
      tl.vis = 'warn'; tl.g.visible = true; tl.splashed = false; tl.g.rotation.set(0, 0, 0);
      tl.capM.color.copy(tl.base).lerp(WARN, .5 + .5 * k);
      tl.g.position.set(tl.x + (Math.random() - .5) * .07, -.12 * Math.min(1, e / w), tl.z + (Math.random() - .5) * .07);
      return;
    }
    // drop: fall from -.12 m with 14 m/s², tumbling; splash once on the way through the water
    const e = c - tl.brk[3], y = -.12 - 7 * e * e;
    if (tl.vis !== 'drop') { tl.vis = 'drop'; tl.capM.color.copy(tl.base).lerp(WARN, .75); }
    if (!tl.splashed && y < WATER_Y + .2) { tl.splashed = true; if (e < .8 && world.onSplash) world.onSplash(tl.x, tl.z, .5); }
    tl.g.visible = y > -9;
    if (tl.g.visible) { tl.g.position.set(tl.x, y, tl.z); tl.g.rotation.set(tl.spin * e, 0, tl.spin * .7 * e); }
  }
  return world;
}

// Make the inner edge of a flat ring uneven (a natural shoreline). Call before rotating it.
function jag(geo, inner, rnd) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), d = Math.hypot(x, y);
    if (Math.abs(d - inner) < .01) { const k = 1 + (rnd() - .3) * .12; p.setX(i, x * k); p.setY(i, y * k); }
  }
}

// Windmill (tower and cap in code, Kenney blades), as in Hide & Seek's farm.
async function windmill(r, keep, lambert) {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * .45, r * .7, r * 2.6, 8)), lambert('#fff4e0')); tower.position.y = r * 1.3;
  const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(r * .62, r * .9, 8)), lambert('#d9534f')); cap.position.y = r * 2.6 + r * .45;
  const door = new THREE.Mesh(keep(new THREE.BoxGeometry(r * .4, r * .65, .08)), lambert('#7a4b3a')); door.position.set(0, r * .33, r * .66);
  g.add(tower, cap, door);
  const blades = await fitted('town/windmill.glb', r * 3.6, { shadow: false });
  blades.position.set(0, r * 2.35, r * .62); blades.rotation.y = Math.PI / 2; g.add(blades);
  g.userData = { spin: blades, axis: 'z', speed: .9 };
  return g;
}
// Watermill: a little red mill house with the Kenney wheel turning in the water.
async function watermill(r, keep, lambert) {
  const g = new THREE.Group(), w = r * 1.5, d = r * 1.2, h = r * 1.1;
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), lambert('#d9534f')); body.position.y = h / 2;
  const roofGeo = keep(new THREE.CylinderGeometry(d * .62, d * .62, w + .3, 3)); roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, lambert('#7a4b3a')); roof.position.y = h + d * .31; roof.rotation.x = -Math.PI / 2; // ridge up
  const door = new THREE.Mesh(keep(new THREE.BoxGeometry(r * .4, r * .6, .06)), lambert('#fff4e0')); door.position.set(0, r * .3, d / 2 + .03);
  g.add(body, roof, door);
  const wheel = await fitted('town/watermill.glb', r * 1.3, { shadow: false });
  wheel.position.set(w / 2 + .15, r * .25, 0); g.add(wheel);
  g.userData = { spin: wheel, axis: 'x', speed: 1.2 };
  return g;
}
