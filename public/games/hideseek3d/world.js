// Builds the 3D world for one Hide & Seek map from the server's genMap data.
// 1 world unit = 100 server units; server (x, y) → world (x, z).
import * as THREE from 'three';
import { makeScene } from '../../core3d/engine.js';
import { prop, fitted, instanced, loadModel, brighten } from '../../core3d/assets.js';
import { makeAmbient, sway } from './ambient.js';

export const U = .01;

const THEME = {
  farm: {
    sky: '#8fd8ff', ground: '#86d65f', patchA: '#7bcc55', patchB: '#93dd6a', path: '#d9b27a', water: '#4cc3ef', rim: '#c9a36b', hemi: '#6fae5a', outside: '#78c452',
    trees: [['nature/tree_oak.glb', 3.2], ['nature/tree_fat.glb', 2.8], ['nature/tree_default.glb', 3.3], ['nature/tree_detailed.glb', 3.1]],
    bushes: [['nature/plant_bushLarge.glb', .95], ['nature/plant_bush.glb', .75], ['nature/plant_bushSmall.glb', .6], ['nature/plant_bushLarge.glb', .85]],
    props: [['survival/barrel.glb', .5], ['survival/box-large.glb', .45], ['nature/log_stackLarge.glb', .42], ['survival/resource-wood.glb', .32]],
    rocks: [['nature/rock_smallA.glb', .3], ['nature/rock_smallB.glb', .3], ['nature/stump_round.glb', .3], ['nature/mushroom_redGroup.glb', .3]],
    decor: [['nature/flower_redA.glb', .35, 70], ['nature/flower_yellowA.glb', .35, 70], ['nature/flower_purpleA.glb', .35, 50], ['nature/grass_large.glb', .4, 140], ['nature/mushroom_red.glb', .3, 20]],
    fence: ['nature/fence_simple.glb', .6], border: ['nature/tree_oak.glb', 3.6],
  },
  snow: {
    sky: '#bfe6ff', ground: '#f3f7ff', patchA: '#e3ecf8', patchB: '#ffffff', path: '#c9d6e6', water: '#a8dcf2', rim: '#dbe7f3', hemi: '#c8d8ea', outside: '#eef4ff',
    trees: [['platformer/tree-pine-snow.glb', 3.5], ['nature/tree_pineRoundA.glb', 3.2], ['platformer/tree-snow.glb', 3.1], ['nature/tree_pineTallA.glb', 3.6]],
    bushes: [['platformer/tree-pine-snow-small.glb', 1], ['nature/plant_bush.glb', .75], ['nature/plant_bushLarge.glb', .9], ['nature/tree_pineSmallA.glb', 1]],
    props: [['holiday/present-a-cube.glb', .4], ['holiday/present-b-rectangle.glb', .38], ['holiday/lantern.glb', .8], ['holiday/rocks-medium.glb', .4]],
    rocks: [['holiday/rocks-small.glb', .3], ['nature/stone_smallA.glb', .3], ['holiday/candy-cane-red.glb', .55], ['holiday/candy-cane-green.glb', .55]],
    decor: [['holiday/rocks-small.glb', .25, 40], ['nature/grass_large.glb', .35, 30], ['holiday/snow-pile.glb', .3, 35]],
    fence: ['holiday/cabin-fence.glb', .65], border: ['platformer/tree-pine-snow.glb', 3.8],
  },
  beach: {
    sky: '#8fdcff', ground: '#f2d9a0', patchA: '#ead09a', patchB: '#f7e2b0', path: '#d9b27a', water: '#3cc6e8', rim: '#e9cf98', hemi: '#e8cf9a', outside: '#efd59c',
    trees: [['pirate/palm-straight.glb', 3.7], ['pirate/palm-bend.glb', 3.4], ['nature/tree_palmTall.glb', 3.8], ['pirate/palm-detailed-straight.glb', 3.6]],
    bushes: [['pirate/grass-plant.glb', .7], ['pirate/patch-sand-foliage.glb', .5], ['nature/plant_bushLarge.glb', .9], ['nature/plant_bush.glb', .75]],
    props: [['pirate/barrel.glb', .5], ['pirate/crate.glb', .45], ['pirate/chest.glb', .38], ['pirate/crate-bottles.glb', .45]],
    rocks: [['pirate/rocks-sand-a.glb', .3], ['pirate/rocks-sand-b.glb', .3], ['pirate/rocks-sand-c.glb', .3], ['pirate/bottle.glb', .3]],
    decor: [['pirate/grass-plant.glb', .35, 45], ['pirate/rocks-sand-a.glb', .18, 30], ['nature/grass_large.glb', .3, 30]],
    fence: ['nature/fence_planks.glb', .6], border: ['pirate/palm-straight.glb', 3.9],
  },
};

function mulberry(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...o });

// --- buildings drawn in code (one per theme), sized to the server rectangle ---
function barn(w, d, theme) {
  const g = new THREE.Group();
  const wallC = theme === 'snow' ? '#a8714a' : '#d9534f', roofC = theme === 'snow' ? '#ffffff' : '#7a4b3a', trim = theme === 'snow' ? '#6b4430' : '#fff4e0';
  const h = Math.min(2.2, 1.2 + Math.min(w, d) * .25);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wallC)); body.position.y = h / 2; g.add(body);
  const rise = Math.min(w, d) * .38, slope = Math.hypot(d / 2 + .25, rise);
  for (const sg of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + .4, .16, slope), mat(roofC));
    r.position.set(0, h + rise / 2, sg * (d / 4 + .06)); r.rotation.x = sg * Math.atan2(rise, d / 2 + .25); g.add(r);
  }
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const gable = new THREE.ExtrudeGeometry(shape, { depth: w - .02, bevelEnabled: false });
  const gm = new THREE.Mesh(gable, mat(wallC)); gm.rotation.y = Math.PI / 2; gm.position.set(-(w - .02) / 2, h, 0); g.add(gm);
  const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.2, w * .35), Math.min(1.5, h * .75), .08), mat(trim)); door.position.set(0, Math.min(1.5, h * .75) / 2, d / 2 + .03); g.add(door);
  for (const sx of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(.5, .45, .08), mat(theme === 'snow' ? '#ffe9a6' : '#bfe8ff', { emissive: theme === 'snow' ? '#ffcf5a' : '#000', emissiveIntensity: .4 })); win.position.set(sx * w * .32, h * .62, d / 2 + .03); g.add(win); }
  if (theme === 'snow') { const ch = new THREE.Mesh(new THREE.BoxGeometry(.4, .9, .4), mat('#8c96a8')); ch.position.set(w * .28, h + rise * .7, -d * .15); g.add(ch); }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

async function hut(w, d) {
  const s = Math.min(w, d) / 2.5;
  const g = new THREE.Group();
  const a = await prop('pirate/structure.glb', 0, { scale: s }); const b = await prop('pirate/structure-roof.glb', 0, { scale: s });
  b.position.y = 2.2 * s; g.add(a, b);
  return g;
}

async function windmill(r) {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(r * .45, r * .7, r * 2.6, 8), mat('#fff4e0')); tower.position.y = r * 1.3;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * .62, r * .9, 8), mat('#d9534f')); cap.position.y = r * 2.6 + r * .45;
  const door = new THREE.Mesh(new THREE.BoxGeometry(r * .4, r * .65, .08), mat('#7a4b3a')); door.position.set(0, r * .33, r * .66);
  g.add(tower, cap, door);
  const blades = await fitted('town/windmill.glb', r * 3.6, { shadow: true });
  blades.position.set(0, r * 2.35, r * .62); blades.rotation.y = Math.PI / 2; g.add(blades);
  g.userData.spin = blades;
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}
async function watermill(r) {
  const g = barn(r * 1.5, r * 1.3, 'farm');
  const wheel = await fitted('town/watermill.glb', r * 1.3);
  wheel.position.set(r * .85, r * .55, 0); g.add(wheel); g.userData.spin = wheel; g.userData.spinAxis = 'x';
  return g;
}

// --- flat ribbon for paths ---
function ribbon(points, width, color) {
  const curve = new THREE.QuadraticBezierCurve3(...points.map(([x, y]) => new THREE.Vector3(x * U, 0, y * U)));
  const pts = curve.getPoints(40), pos = [], idx = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2;
    pos.push(p.x + nx, .012, p.z + nz, p.x - nx, .012, p.z - nz);
    if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, i * 2, i * 2 + 1, (i - 1) * 2 + 1);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(color)); m.receiveShadow = true;
  return m;
}

// Covers (trees + bushes) are instanced; the few near the player are swapped for see-through clones.
class Covers {
  constructor(scene) { this.scene = scene; this.items = []; this.grid = new Map(); this.faded = new Map(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0); }
  async add(path, height, list, r, shadow) {
    if (!list.length) return;
    const group = await instanced(path, height, list, { shadow });
    this.scene.add(group);
    list.forEach((it, i) => {
      const item = { ...it, path, height, group, i, r };
      this.items.push(item);
      const k = `${Math.floor(it.x / 3)},${Math.floor(it.z / 3)}`;
      (this.grid.get(k) || this.grid.set(k, []).get(k)).push(item);
    });
  }
  near(x, z, r = 1.6) {
    const out = [], cx = Math.floor(x / 3), cz = Math.floor(z / 3);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const it of this.grid.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(it.x - x, it.z - z) < it.r + r && it.z > z - .6) out.push(it);
    return out;
  }
  // fade covers that are in front of / around the point (x, z)
  update(x, z) {
    const want = new Set(this.near(x, z));
    for (const [it, clone] of this.faded) if (!want.has(it)) { clone.removeFromParent(); this.restore(it); this.faded.delete(it); }
    for (const it of want) if (!this.faded.has(it)) {
      this.faded.set(it, null);
      for (const im of it.group.children) { const m = new THREE.Matrix4(); im.getMatrixAt(it.i, m); (it.mats = it.mats || []).push(m); im.setMatrixAt(it.i, this.zero); im.instanceMatrix.needsUpdate = true; }
      prop(it.path, it.height * (it.s || 1), { fade: true, shadow: false }).then(c => {
        if (!this.faded.has(it)) { this.restore(it, true); return; }
        c.position.set(it.x, 0, it.z); c.rotation.y = it.ry || 0;
        c.traverse(m => { if (m.isMesh) { m.material.opacity = .35; m.material.depthWrite = false; } });
        this.scene.add(c); this.faded.set(it, c);
      });
    }
  }
  restore(it, already) {
    if (!it.mats) return;
    it.group.children.forEach((im, k) => { im.setMatrixAt(it.i, it.mats[k]); im.instanceMatrix.needsUpdate = true; });
    it.mats = null;
  }
}

export async function buildWorld(map, quality) {
  const T = THEME[map.theme] || THEME.farm, r = mulberry(map.seed || 1);
  const W = map.W * U, H = map.H * U;
  const scene = makeScene({ sky: T.sky, fog: [26, 58], ground: T.hemi });
  const jobs = [], spinners = [], water = [], foams = [], wind = { uTime: { value: 0 } };
  await Promise.all([...T.trees, ...T.bushes, ...T.decor, T.border].map(([f]) => brighten(f)));
  // ground (extends past the map edge) + soft colour patches
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, H + 60), mat(T.outside, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -.01, H / 2); ground.receiveShadow = true; scene.add(ground);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(T.ground, { roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.set(W / 2, 0, H / 2); field.receiveShadow = true; scene.add(field);
  {
    const n = Math.round(W * H / 18), pm = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24), mat('#ffffff', { roughness: 1 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), cA = new THREE.Color(T.patchA), cB = new THREE.Color(T.patchB);
    for (let i = 0; i < n; i++) {
      e.set(-Math.PI / 2, r() * 6.3, 0, 'YXZ'); q.setFromEuler(e); p.set(r() * W, .004 + i * 1e-5, r() * H); s.set(1.5 + r() * 3, 1 + r() * 2, 1);
      pm.setMatrixAt(i, m4.compose(p, q, s)); pm.setColorAt(i, r() < .5 ? cA : cB);
    }
    pm.receiveShadow = true; scene.add(pm);
  }
  // paths
  for (const p of map.paths) scene.add(ribbon(p, 1, T.path));
  // ponds
  for (const p of map.ponds) {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(T.rim)); rim.rotation.x = -Math.PI / 2; rim.scale.set(p.rx * U + .25, p.ry * U + .25, 1); rim.position.set(p.cx * U, .02, p.cy * U); scene.add(rim);
    const w = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(T.water, { roughness: .15, metalness: .1 })); w.rotation.x = -Math.PI / 2; w.scale.set(p.rx * U, p.ry * U, 1); w.position.set(p.cx * U, .03, p.cy * U); scene.add(w); water.push(w);
    if (map.theme === 'farm') for (let i = 0; i < 4; i++) { const a = r() * 6.3, k = .3 + r() * .5; jobs.push(prop(`nature/lily_${i % 2 ? 'small' : 'large'}.glb`, .08).then(o => { o.position.set(p.cx * U + Math.cos(a) * p.rx * U * k, .04, p.cy * U + Math.sin(a) * p.ry * U * k); scene.add(o); })); }
  }
  // sea (beach)
  for (const s of map.seas) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, 60), mat(T.water, { roughness: .2, metalness: .1 })); sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, .03, s.y * U + 30); scene.add(sea); water.push(sea);
    for (let i = 0; i < 2; i++) { const foam = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, .3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9 })); foam.rotation.x = -Math.PI / 2; foam.position.set(W / 2, .045 + i * .002, s.y * U + .1); foam.userData.z0 = s.y * U + .1; foam.userData.ph = i * Math.PI; scene.add(foam); foams.push(foam); }
    jobs.push(fitted('pirate/structure-platform-dock.glb', 1.6).then(o => { o.position.set(W * .55, 0, s.y * U + .9); scene.add(o); }));
  }
  // patches: fields / gardens / beach corners
  for (const f of map.patches) {
    const x = f.x * U, z = f.y * U, w = f.w * U, d = f.h * U;
    if (map.theme === 'farm') {
      const soil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat('#d2a46c', { roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.set(x + w / 2, .015, z + d / 2); soil.receiveShadow = true; scene.add(soil);
      for (let iz = .6; iz < d; iz += 1.2) { const fur = new THREE.Mesh(new THREE.BoxGeometry(w - .3, .03, .34), mat('#b88454', { roughness: 1 })); fur.position.set(x + w / 2, .02, z + iz); fur.receiveShadow = true; scene.add(fur); }
      const crops = ['nature/crop_pumpkin.glb', 'nature/crops_cornStageD.glb', 'nature/crop_carrot.glb', 'nature/crops_wheatStageB.glb', 'nature/crop_melon.glb', 'nature/crop_turnip.glb'];
      const c = crops[f.kind % crops.length], list = [];
      for (let ix = .6; ix < w; ix += 1.2) for (let iz = .6; iz < d; iz += 1.2) list.push({ x: x + ix, z: z + iz, ry: r() * 6.3, s: .85 + r() * .3 });
      const tall = c.includes('corn') || c.includes('wheat');
      jobs.push(brighten(c).then(() => instanced(c, tall ? .8 : .4, list)).then(g => scene.add(tall ? sway(g, wind, .1) : g)));
    } else if (map.theme === 'snow') {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(f.kind % 2 ? '#bfe4f7' : '#ffffff', { roughness: f.kind % 2 ? .2 : 1 })); pad.rotation.x = -Math.PI / 2; pad.position.set(x + w / 2, .015, z + d / 2); scene.add(pad);
      const list = []; for (let i = 0; i < 10; i++) list.push({ x: x + .4 + r() * (w - .8), z: z + .4 + r() * (d - .8), ry: r() * 6.3 });
      jobs.push(instanced(f.kind % 2 ? 'holiday/lantern.glb' : 'holiday/present-a-round.glb', f.kind % 2 ? .9 : .45, list).then(g => scene.add(g)));
    } else {
      const towel = ['#ff5d6c', '#4fb4ff', '#ffc727', '#55d36b'];
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(.7, .03, 1.3), mat(towel[(i + f.kind) % 4])); t.position.set(x + .6 + r() * (w - 1.2), .02, z + .8 + r() * (d - 1.6)); t.rotation.y = r() * .6 - .3; scene.add(t);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.6, 6), mat('#fff')); const um = new THREE.Mesh(new THREE.ConeGeometry(.75, .35, 10), mat(towel[(i + f.kind + 1) % 4]));
        pole.position.set(t.position.x + .5, .8, t.position.z - .3); um.position.set(t.position.x + .5, 1.6, t.position.z - .3); pole.castShadow = um.castShadow = true; scene.add(pole, um);
      }
    }
  }
  // buildings
  for (const b of map.buildings) {
    const w = b.w * U, d = b.h * U, cx = b.x * U + w / 2, cz = b.y * U + d / 2;
    if (map.theme === 'beach') jobs.push(hut(w, d).then(g => { g.position.set(cx, 0, cz); scene.add(g); }));
    else { const g = barn(w, d, map.theme); g.position.set(cx, 0, cz); scene.add(g); }
  }
  // landmarks
  const LM = {
    windmill: l => windmill(l.r * U * 1.1), watermill: l => watermill(l.r * U),
    stall: l => fitted(r() < .5 ? 'town/stall-red.glb' : 'town/stall-green.glb', l.r * U * 2), cart: l => fitted('town/cart.glb', l.r * U * 2.2),
    well: l => fitted('town/fountain-round.glb', l.r * U * 2), tent: l => fitted('survival/tent.glb', l.r * U * 2.1),
    snowman: l => prop('holiday/snowman-hat.glb', 1.4), 'tree-decorated': l => prop('holiday/tree-decorated-snow.glb', 3),
    train: async l => { const g = new THREE.Group(); const parts = ['holiday/train-locomotive.glb', 'holiday/train-wagon.glb', 'holiday/train-wagon-logs.glb']; let x = 0; for (const p of parts) { const o = await fitted(p, l.r * U * .8); o.position.x = x; x -= l.r * U * .75; g.add(o); } g.children.forEach(c => c.position.x -= x / 2); return g; },
    sled: l => fitted('holiday/sled-long.glb', l.r * U * 2.2), 'snow-pile': l => fitted('holiday/snow-pile.glb', l.r * U * 2.2),
    tower: l => fitted('pirate/tower-complete-small.glb', l.r * U * 2.1), wreck: l => fitted('pirate/ship-wreck.glb', l.r * U * 2.4),
    boat: l => fitted('pirate/boat-row-large.glb', l.r * U * 2.3), flag: l => prop('pirate/flag-pirate.glb', 2.2),
    crates: async l => { const g = new THREE.Group(); const a = await fitted('pirate/crate.glb', .7), b = await fitted('pirate/barrel.glb', .55), c = await fitted('pirate/chest.glb', .6); a.position.set(-.3, 0, 0); b.position.set(.35, 0, .1); c.position.set(0, 0, .45); g.add(a, b, c); return g; },
  };
  for (const l of map.landmarks) {
    const make = LM[l.type]; if (!make) continue;
    jobs.push(make(l).then(o => { o.position.set(l.x * U, 0, l.y * U); o.rotation.y = l.rot || 0; if (o.userData.spin) spinners.push(o.userData); scene.add(o); }));
  }
  // static props (blocking), rocks, scattered decoration — all instanced
  const byVariant = (arr, defs) => defs.map((_, k) => arr.filter(a => a[2] % defs.length === k).map(a => ({ x: a[0] * U, z: a[1] * U, ry: r() * 6.3, s: .9 + r() * .25 })));
  byVariant(map.props, T.props).forEach((list, k) => jobs.push(instanced(T.props[k][0], T.props[k][1], list, { shadow: true }).then(g => scene.add(g))));
  byVariant(map.rocks, T.rocks).forEach((list, k) => jobs.push(instanced(T.rocks[k][0], T.rocks[k][1], list).then(g => scene.add(g))));
  const blocked = (x, z) => map.ponds.some(p => ((x / U - p.cx) / (p.rx + 30)) ** 2 + ((z / U - p.cy) / (p.ry + 30)) ** 2 < 1) || map.buildings.some(b => x / U > b.x - 20 && x / U < b.x + b.w + 20 && z / U > b.y - 20 && z / U < b.y + b.h + 20) || map.seas.some(s => z / U > s.y - 20);
  const scale = (W * H) / (48 * 33);
  for (const [path, h, n] of T.decor) {
    const list = [];
    for (let i = 0; i < n * scale; i++) { const x = r() * W, z = r() * H; if (!blocked(x, z)) list.push({ x, z, ry: r() * 6.3, s: .7 + r() * .6 }); }
    jobs.push(instanced(path, h, list).then(g => scene.add(/grass|flower/.test(path) ? sway(g, wind, .16) : g)));
  }
  // fence around the map (beach: no fence on the sea side) + trees outside it
  const fl = [], step = 1.15, seaTop = map.seas.length ? map.seas[0].y * U : null;
  for (let x = 0; x <= W; x += step) { fl.push({ x, z: -.3, ry: 0 }); if (seaTop == null) fl.push({ x, z: H + .3, ry: 0 }); }
  for (let z = 0; z <= (seaTop ?? H); z += step) { fl.push({ x: -.3, z, ry: Math.PI / 2 }); fl.push({ x: W + .3, z, ry: Math.PI / 2 }); }
  jobs.push(instanced(T.fence[0], T.fence[1], fl).then(g => scene.add(g)));
  const out = [];
  for (let i = 0; i < 160; i++) {
    const side = i % 4, t = r();
    const [x, z] = side === 0 ? [t * (W + 16) - 8, -1.5 - r() * 7] : side === 1 ? [-1.5 - r() * 7, t * H] : side === 2 ? [W + 1.5 + r() * 7, t * H] : [t * (W + 16) - 8, H + 1.5 + r() * 7];
    if (seaTop != null && z > seaTop) continue;
    out.push({ x, z, ry: r() * 6.3, s: .8 + r() * .5 });
  }
  jobs.push(instanced(T.border[0], T.border[1], out).then(g => scene.add(g)));
  // covers (hiding spots)
  const covers = new Covers(scene);
  const coverList = (arr, defs) => defs.map((_, k) => arr.filter(a => a[2] % defs.length === k).map(a => ({ x: a[0] * U, z: a[1] * U, ry: r() * 6.3, s: .88 + r() * .3 })));
  coverList(map.trees, T.trees).forEach((list, k) => jobs.push(covers.add(T.trees[k][0], T.trees[k][1], list, .9, true)));
  coverList(map.bushes, T.bushes).forEach((list, k) => jobs.push(covers.add(T.bushes[k][0], T.bushes[k][1], list, .6, false)));

  await Promise.all(jobs);
  const ambient = makeAmbient(map.theme, scene, quality && quality.mobile);
  if (seaTop != null) ambient.seaTop = seaTop;
  let t = 0;
  return {
    scene, covers, W, H,
    tick(dt, focus) {
      t += dt; wind.uTime.value = t;
      if (focus) ambient.tick(dt, focus);
      for (const f of foams) { const k = Math.sin(t * 1.3 + f.userData.ph); f.position.z = f.userData.z0 + .25 + k * .25; f.material.opacity = .45 + .45 * Math.max(0, -k); f.scale.y = 1 + (1 + k) * .8; }
      for (const s of spinners) s.spin.rotation[s.spinAxis || 'z'] += dt * (s.spinAxis ? 1.2 : .9);
      for (const w of water) w.material.color.offsetHSL(0, 0, Math.sin(t * 1.5) * .0006);
    },
    dispose() { ambient.dispose(); scene.traverse(o => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); }); },
  };
}

export async function preloadTheme(theme) {
  const T = THEME[theme] || THEME.farm;
  const paths = [...T.trees, ...T.bushes, ...T.props, ...T.rocks, ...T.decor, T.fence, T.border].map(a => a[0]);
  await Promise.all(paths.map(p => loadModel(p).catch(() => null)));
}
