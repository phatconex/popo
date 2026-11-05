// Blind Drive 3D world for one level: hilly terrain, the road (shoulder, asphalt, centre dashes), start line,
// finish arch, stop rings with waiting animals, coins, slicks and crossing animals. Metres; y from BD.heightAt.
// Scenery (trees, houses, sea...) is added by a later task.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeScene } from '../../core3d/engine.js';
import { prop, pet } from '../../core3d/assets.js';
import { makeAmbient } from './ambient.js';

const BD = window.BD;
const UP = new THREE.Vector3(0, 1, 0);

// Colours per map: sky, ground low/high (hilltops lighter), shoulder, road, centre dashes, hemisphere ground,
// light strength (hemisphere, sun), slick colour.
const LOOK = {
  country: { sky: '#8fd8ff', lo: '#93d46f', hi: '#c4ef93', shoulder: '#ecdcae', road: '#a6a1c0', dash: '#ffffff', hemi: '#86b36a', light: [1.55, 2.5], slick: '#76cdfb' },
  snow: { sky: '#bfe6ff', lo: '#eef4ff', hi: '#ffffff', shoulder: '#d6e2ef', road: '#97a8c0', dash: '#ffffff', hemi: '#c8d8ea', light: [1.45, 2.3], slick: '#bfe9ff' },
  beach: { sky: '#8fdcff', lo: '#f0d49a', hi: '#f8e6bd', shoulder: '#e3c58c', road: '#b3a6a4', dash: '#ffffff', hemi: '#e8cf9a', light: [1.55, 2.5], slick: '#5fc8f0' },
  night: { sky: '#1f2c58', lo: '#2f5a3e', hi: '#4f8a5a', shoulder: '#8a8170', road: '#6c6870', dash: '#ffe9a6', hemi: '#33415f', light: [.8, .7], slick: '#4f8fd6' },
};
const NAV_FOG = [45, 120], DRIVER_BG = '#eaf2f9', DRIVER_FOG = [1.2, 5.4];

const lam = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .95, ...o });

// Smooth centre line through the track points, sampled every ~0.5 m: [{x, z, tx, tz}] (tangent unit vector).
function centre(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(8, Math.round(curve.getLength() / .5));
  const ps = curve.getSpacedPoints(n);
  return ps.map((p, i) => {
    const a = ps[Math.max(0, i - 1)], b = ps[Math.min(n, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: p.x, z: p.z, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
  });
}

// A band of width w along samples [i0, i1], each vertex lifted `lift` above the terrain. Appends into pos/idx.
function band(H, cl, w, lift, i0, i1, pos, idx) {
  const base = pos.length / 3;
  for (let i = i0; i <= i1; i++) {
    const c = cl[i], rx = -c.tz * w / 2, rz = c.tx * w / 2; // right vector (-tz, tx)
    const ax = c.x + rx, az = c.z + rz, bx = c.x - rx, bz = c.z - rz;
    pos.push(ax, H(ax, az) + lift, az, bx, H(bx, bz) + lift, bz);
    if (i < i1) { const k = base + (i - i0) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } // faces up
  }
}
function meshOf(pos, idx, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  return m;
}

function checker(cols = 16, rows = 2) {
  const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 16;
  const c = cv.getContext('2d');
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { c.fillStyle = (i + j) % 2 ? '#24304a' : '#ffffff'; c.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function buildWorld(track, quality) {
  const T = LOOK[track.theme] || LOOK.country, hills = track.hills || [], rw = track.rw;
  const H = (x, z) => BD.heightAt(hills, x, z);
  const normalAt = (x, z) => new THREE.Vector3(H(x - .2, z) - H(x + .2, z), .4, H(x, z - .2) - H(x, z + .2)).normalize();
  const scene = makeScene({ sky: T.sky, fog: NAV_FOG, ground: T.hemi });
  scene.children.forEach(o => { if (o.isHemisphereLight) o.intensity = T.light[0]; if (o.isDirectionalLight) o.intensity = T.light[1]; });
  if (track.theme === 'night') scene.children.forEach(o => { if (o.isHemisphereLight) o.color.set('#b8c4f0'); if (o.isDirectionalLight) o.color.set('#c8d4ff'); });
  const navFog = scene.fog, navBg = scene.background;
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // a flat mesh (lying in its local XY plane) placed at (x, z), tilted to the terrain normal, turned by yaw
  const flat = (mesh, x, z, lift, yaw = 0) => {
    const g = new THREE.Group(); mesh.rotation.x = -Math.PI / 2; g.add(mesh);
    g.position.set(x, H(x, z) + lift, z);
    g.quaternion.setFromUnitVectors(UP, normalAt(x, z)).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    scene.add(g); return g;
  };

  // --- terrain: a grid over the track's bounding box, following the hills, lighter toward the tops ---
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of track.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const M = 40; x0 -= M; x1 += M; z0 -= M; z1 += M;
  const cell = quality && quality.mobile ? 1.6 : 1.1;
  const nx = Math.min(320, Math.ceil((x1 - x0) / cell)), nz = Math.min(320, Math.ceil((z1 - z0) / cell));
  const tg = keep(new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz));
  tg.rotateX(-Math.PI / 2); tg.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  {
    const a = tg.attributes.position, col = [], lo = new THREE.Color(T.lo), hi = new THREE.Color(T.hi), c = new THREE.Color();
    const top = Math.max(1, ...hills.map(h => h.h));
    for (let i = 0; i < a.count; i++) {
      const y = H(a.getX(i), a.getZ(i)); a.setY(i, y);
      c.copy(lo).lerp(hi, Math.min(1, y / top)); col.push(c.r, c.g, c.b);
    }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); tg.computeVertexNormals();
  }
  const ground = new THREE.Mesh(tg, keep(lam(T.lo, { vertexColors: true, color: '#ffffff', roughness: 1 })));
  ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(keep(new THREE.PlaneGeometry(1600, 1600)), keep(lam(T.lo, { roughness: 1 })));
  far.rotation.x = -Math.PI / 2; far.position.set((x0 + x1) / 2, -.04, (z0 + z1) / 2); scene.add(far);

  // --- road: shoulder, asphalt, centre dashes (0.9 m every 2 m) ---
  const cl = centre(track.pts), last = cl.length - 1;
  for (const [w, lift, color] of [[2 * rw + 1.2, .05, T.shoulder], [2 * rw, .09, T.road]]) {
    const pos = [], idx = []; band(H, cl, w, lift, 0, last, pos, idx);
    const m = meshOf(pos, idx, keep(lam(color))); keep(m.geometry); scene.add(m);
  }
  {
    const pos = [], idx = [], step = 4; // samples are .5 m apart: 2 m period, ~1 m dash (band end is inclusive)
    for (let i = 2; i + 2 <= last; i += step) band(H, cl, .16, .12, i, i + 2, pos, idx);
    const m = meshOf(pos, idx, keep(lam(T.dash, { roughness: .8 }))); keep(m.geometry); scene.add(m);
  }

  // --- start line (just ahead of the start grid at pts[1]) and finish line + arch at pts[finishI] ---
  const tangent = i => { const p = track.pts, a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  {
    const [tx, tz] = tangent(1), p = track.pts[1];
    const sl = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * rw, .3)), keep(lam('#ffffff', { roughness: .8 })));
    flat(sl, p[0] + tx * 3, p[1] + tz * 3, .11, Math.atan2(tx, tz));
  }
  {
    const fi = Math.min(track.finishI, track.pts.length - 1), p = track.pts[fi], [tx, tz] = tangent(fi), yaw = Math.atan2(tx, tz);
    const tex = keep(checker(Math.round(2 * rw / .4), 2));
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * rw, .8)), keep(lam('#ffffff', { map: tex, roughness: .8 })));
    flat(line, p[0], p[1], .11, yaw);
    const arch = new THREE.Group(), half = rw + .9;
    const post = keep(lam('#ff5d6c', { roughness: .6 })), banTex = keep(checker(16, 2)), banM = keep(lam('#ffffff', { map: banTex, roughness: .7 }));
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(keep(new RoundedBoxGeometry(.4, 3.2, .4, 2, .1)), post);
      m.position.set(s * half, 1.6, 0); m.castShadow = true; arch.add(m);
    }
    const ban = new THREE.Mesh(keep(new THREE.BoxGeometry(2 * half + .4, .6, .15)), [post, post, post, post, banM, banM]);
    ban.position.y = 3; ban.castShadow = true; arch.add(ban);
    arch.position.set(p[0], Math.min(H(p[0] - tz * half, p[1] + tx * half), H(p[0] + tz * half, p[1] - tx * half)), p[1]);
    arch.rotation.y = yaw; scene.add(arch);
  }

  // --- slicks: puddles (ice sheets on the snow map) as ellipses: rz along heading a, rx across ---
  for (const sl of track.slicks || []) {
    const ice = track.theme === 'snow';
    const m = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 32)), keep(lam(T.slick, { roughness: ice ? .1 : .2, transparent: true, opacity: ice ? .92 : .88 })));
    m.scale.set(sl.rx, sl.rz, 1); // local x across the road, local y (after lying flat: -z) along it
    flat(m, sl.x, sl.z, .14, sl.a || 0);
    const glint = new THREE.Mesh(keep(new THREE.CircleGeometry(.18, 12)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .8 })));
    flat(glint, sl.x + Math.cos(sl.a || 0) * sl.rx * .35, sl.z - Math.sin(sl.a || 0) * sl.rx * .35, .145, sl.a || 0);
  }

  // --- stops: a pulsing ring on the road edge, the waiting animal beside the road, a signpost ---
  const ringGeo = keep(new THREE.RingGeometry(1.05, 1.35, 40)), ringMat = keep(new THREE.MeshBasicMaterial({ color: '#ff7fc8', transparent: true, opacity: .85 }));
  const stops = await Promise.all((track.stops || []).map(async st => {
    const sp = BD.stopPoints(track, st);
    const ring = flat(new THREE.Mesh(ringGeo, ringMat), sp.ring.x, sp.ring.z, .16);
    const p = await pet(st.kind, .78);
    p.root.position.set(sp.pet.x, H(sp.pet.x, sp.pet.z), sp.pet.z);
    p.root.rotation.y = Math.atan2(sp.ring.x - sp.pet.x, sp.ring.z - sp.pet.z);
    p.play('gesture-positive');
    scene.add(p.root);
    const ox = (sp.pet.x - sp.ring.x), oz = (sp.pet.z - sp.ring.z), ol = Math.hypot(ox, oz) || 1, [tx, tz] = tangent(st.i);
    const sign = await prop('survival/signpost.glb', 1.5);
    const sx = sp.pet.x + ox / ol * .5 - tx * 1.1, sz = sp.pet.z + oz / ol * .5 - tz * 1.1;
    sign.position.set(sx, H(sx, sz), sz); sign.rotation.y = Math.atan2(-ox, -oz);
    scene.add(sign);
    return { ring, pet: p, sign, i: st.i, kind: st.kind };
  }));

  // --- coins (rows of 5 along the road) ---
  const coins = await Promise.all((track.coins || []).map(async ([x, z]) => {
    const c = await prop('platformer/coin-gold.glb', .55);
    c.position.set(x, H(x, z) + .6, z);
    scene.add(c); return c;
  }));

  // --- crossing animals: walk across the road at pts[c.i], position from the shared level clock ---
  const crossers = await Promise.all((track.crossers || []).map(async c => {
    const p = await pet(c.kind, .8);
    p.c = c; p.at = track.pts[c.i]; p.tan = tangent(c.i); scene.add(p.root);
    return p;
  }));

  const ambient = makeAmbient(track.theme, scene, quality && quality.mobile);
  let time = 0;
  const placeCrossers = t => {
    for (const p of crossers) {
      const q = BD.crosserPos(track, p.c, t), pt = p.at, tx = p.tan[0], tz = p.tan[1];
      p.root.position.set(q.x, H(q.x, q.z), q.z);
      // walking: face the walking direction along the right vector (-tz, tx); resting: face the road
      const side = (q.x - pt[0]) * -tz + (q.z - pt[1]) * tx;
      const dir = q.dir || (side < 0 ? 1 : -1);
      p.root.rotation.y = Math.atan2(-tz * dir, tx * dir);
      p.play(q.dir ? 'walk' : 'idle');
    }
  };
  placeCrossers(0);

  return {
    scene, stops, coins, crossers, track, ambient, heightAt: H,
    tick(dt, t, cam) {
      time += dt;
      for (const s of stops) {
        s.pet.mixer.update(dt);
        if (s.ring.visible) { const k = 1 + Math.sin(time * 4) * .08; s.ring.scale.set(k, 1, k); }
      }
      for (const c of coins) c.rotation.y += dt * 3;
      placeCrossers(t);
      for (const p of crossers) p.mixer.update(dt);
      if (cam) ambient.tick(dt, cam);
    },
    setDriverView(on) {
      if (on) { scene.fog = new THREE.Fog(DRIVER_BG, DRIVER_FOG[0], DRIVER_FOG[1]); scene.background = new THREE.Color(DRIVER_BG); }
      else { scene.fog = navFog; scene.background = navBg; }
    },
    dispose() {
      ambient.dispose();
      for (const s of stops) s.pet.dispose();
      for (const p of crossers) p.dispose();
      for (const o of disposables) o.dispose && o.dispose();
    },
  };
}
