// A Blind Drive car: rounded boxes in the team colour, spinning wheels, the driver's animal at the wheel and
// picked-up passengers behind. Every material here is the car's own with fog off, so the driver still sees
// the car inside the driver-view fog. Faces +z; rotation.y = heading a faces (sin a, cos a).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pet } from '../../core3d/assets.js';

export const TEAM_COL = ['#ff5d6c', '#4fb4ff', '#55d36b', '#ffc727'];
const WHEEL_R = .27;
const DRIVER_SEAT = [0, .62, -.05];
const SEATS = [[-.27, .62, -.52], [.27, .62, -.52], [-.27, .86, -.86], [.27, .86, -.86]]; // up to 4 stops a level

// Give every mesh under `o` its own copies of its materials with fog off (pets share materials between clones).
function ownMaterials(o, list) {
  o.traverse(m => {
    if (!m.isMesh) return;
    const one = mt => { const c = mt.clone(); c.fog = false; list.push(c); return c; };
    m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
  });
}

export async function makeCar(teamColor, driverCode) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = new THREE.Group(); root.add(body); // body carries the spin-out animation
  const mats = [], geos = [], flagMats = [];
  const mat = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .6, fog: false, ...o }); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const add = (g, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo(g), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

  const paint = mat(teamColor), white = mat('#ffffff'), tyre = mat('#2b2f3f', { roughness: .9 });
  add(new RoundedBoxGeometry(1.2, .44, 2, 3, .14), paint, 0, .46, 0);
  add(new RoundedBoxGeometry(1.14, .2, .62, 3, .08), paint, 0, .72, .66);
  add(new RoundedBoxGeometry(1.14, .24, .5, 3, .08), paint, 0, .74, -.74);
  add(new RoundedBoxGeometry(.98, .1, 1.0, 2, .04), mat('#3a3550'), 0, .66, -.08);
  const ws = add(new RoundedBoxGeometry(1.0, .36, .06, 2, .03), mat('#c8efff', { transparent: true, opacity: .75, roughness: .2 }), 0, .92, .34); ws.rotation.x = -.38;
  add(new RoundedBoxGeometry(1.24, .16, .14, 2, .06), white, 0, .3, 1.02);
  add(new RoundedBoxGeometry(1.24, .16, .14, 2, .06), white, 0, .3, -1.02);
  const head = new THREE.MeshBasicMaterial({ color: '#fff3a6', fog: false }), tail = new THREE.MeshBasicMaterial({ color: '#ff8a8a', fog: false });
  mats.push(head, tail);
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(.24, .13, .06, 2, .03), head, s * .38, .54, 1.0);
    add(new RoundedBoxGeometry(.2, .1, .06, 2, .03), tail, s * .4, .54, -1.0);
  }
  const wheels = [], tyreG = geo(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, .24, 18)), hubG = geo(new THREE.CylinderGeometry(.12, .12, .26, 12));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * .58, WHEEL_R - .01, sz * .64); body.add(w);
    const t = new THREE.Mesh(tyreG, tyre); t.rotation.z = Math.PI / 2; t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(hubG, white); h.rotation.z = Math.PI / 2; w.add(h);
    wheels.push(w);
  }
  // soft round shadow under the car, so it does not float in the driver fog
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(36,48,74,.45)'); gr.addColorStop(1, 'rgba(36,48,74,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }); mats.push(m); geos.push(tex);
    const sh = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.9, 2.8)), m); sh.rotation.x = -Math.PI / 2; sh.position.y = .1; root.add(sh);
  }
  // team flag, shown on ghost cars (other teams, seen by navigators)
  const flag = new THREE.Group(); flag.visible = false; body.add(flag);
  {
    // own materials, kept opaque when the car turns into a ghost; the cloth faces backwards (toward the camera)
    const fm = new THREE.MeshStandardMaterial({ color: teamColor, roughness: .7, fog: false }), pm = new THREE.MeshStandardMaterial({ color: '#24304a', roughness: .7, fog: false });
    flagMats.push(fm, pm);
    add(new THREE.CylinderGeometry(.04, .04, 1.6, 8), pm, 0, .8, 0, flag);
    add(new THREE.BoxGeometry(.75, .48, .05), fm, -.375, 1.34, 0, flag);
    flag.position.set(.45, .7, -.8);
  }

  const petMats = [];
  const seat = async (code, h, at) => {
    const p = await pet(code, h);
    ownMaterials(p.root, petMats);
    p.root.position.set(...at);
    p.root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return p;
  };
  const driver = await seat(driverCode, .62, DRIVER_SEAT);
  body.add(driver.root);

  let riders = [], gen = 0, ghost = false, spinLeft = 0, spinDur = 0, disposed = false;
  const last = { x: 0, z: 0, set: false };
  const applyGhost = () => {
    for (const m of [...mats, ...petMats]) {
      if (m.userData.op == null) m.userData.op = m.opacity, m.userData.tr = m.transparent;
      m.opacity = ghost ? m.userData.op * .5 : m.userData.op;
      m.transparent = ghost || m.userData.tr;
      m.needsUpdate = true;
    }
    flag.visible = ghost;
  };

  return {
    root,
    // y = ground height under the car, pitch = nose-up angle in radians (atan of the slope along the heading)
    setPose(x, z, a, y, pitch) {
      if (last.set) { // roll the wheels by the distance moved along the heading (skip teleports)
        const d = (x - last.x) * Math.sin(a) + (z - last.z) * Math.cos(a);
        if (Math.abs(d) < 2) for (const w of wheels) w.rotation.x += d / WHEEL_R;
      }
      last.x = x; last.z = z; last.set = true;
      root.position.set(x, y, z);
      root.rotation.set(-pitch, a, 0);
    },
    // codes: animal codes of the passengers on board, in pick-up order
    async setRiders(codes) {
      const want = codes.slice(0, SEATS.length);
      if (want.length === riders.length && want.every((c, i) => riders[i].code === c)) return;
      const my = ++gen;
      const keepN = riders.findIndex((r, i) => r.code !== want[i]);
      const keepCount = keepN < 0 ? Math.min(riders.length, want.length) : keepN;
      for (const r of riders.slice(keepCount)) r.dispose();
      riders = riders.slice(0, keepCount);
      for (let i = keepCount; i < want.length; i++) {
        const p = await seat(want[i], .44, SEATS[i]);
        if (my !== gen || disposed) { p.dispose(); return; }
        p.play('dance'); body.add(p.root); riders.push(p);
        if (ghost) applyGhost();
      }
    },
    setGhost(on) { if (ghost === !!on) return; ghost = !!on; applyGhost(); },
    // start a spin-out animation lasting t seconds
    spin(t = 2) { spinLeft = spinDur = t; },
    tick(dt) {
      driver.mixer.update(dt);
      for (const r of riders) r.mixer.update(dt);
      if (spinLeft > 0) {
        spinLeft = Math.max(0, spinLeft - dt);
        const k = 1 - spinLeft / spinDur, e = 1 - (1 - k) ** 3;
        body.rotation.y = e * Math.PI * 4;
        body.position.y = Math.sin(Math.min(1, k * 3) * Math.PI) * .35;
      } else { body.rotation.y = 0; body.position.y = 0; }
    },
    dispose() {
      disposed = true; gen++;
      root.removeFromParent();
      driver.dispose(); for (const r of riders) r.dispose();
      for (const m of [...mats, ...petMats, ...flagMats]) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
