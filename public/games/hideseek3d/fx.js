// Visual effects: water arcs, splashes, sound bubbles, Zzz, footprints, listen ripples, confetti.
import * as THREE from 'three';
import { tag } from '../../core3d/ui.js';
import { U } from './world.js';

export const SOUND = {
  pig: 'Oink!', cow: 'Moo~', chick: 'Peep!', bunny: 'Squeak!', dog: 'Woof!', cat: 'Meow!', penguin: 'Honk!', polar: 'Grrr!', fox: 'Yip!',
  deer: 'Bleat!', beaver: 'Chomp!', crab: 'Click clack!', parrot: 'Squawk!', monkey: 'Ooh ooh!', koala: 'Hmm~', tiger: 'Rawr!',
};

const MAX_FP = 400;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.zzz = new Map();
    // footprints: one instanced mesh, rebuilt from each snapshot
    this.fp = new THREE.InstancedMesh(new THREE.CircleGeometry(.07, 8), new THREE.MeshBasicMaterial({ color: '#5a3d2b', transparent: true, opacity: .6, depthWrite: false }), MAX_FP);
    this.fp.count = 0; this.fp.renderOrder = 1; this.fp.frustumCulled = false; scene.add(this.fp);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
  }

  shot(x1, y1, x2, y2, hit) {
    const a = new THREE.Vector3(x1 * U, .65, y1 * U), b = new THREE.Vector3(x2 * U, hit ? .5 : .05, y2 * U);
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .5).setY(1.3), b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .07, 8), new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: .9 }));
    const splash = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: .9 }));
    splash.position.copy(b);
    this.scene.add(tube, splash);
    this.items.push({ t: .45, max: .45, tick: (k) => { tube.material.opacity = Math.min(.9, k * 2); splash.scale.setScalar(1 + (1 - k) * 2.5); splash.material.opacity = k; }, dispose: () => { tube.geometry.dispose(); tube.removeFromParent(); splash.removeFromParent(); } });
  }

  ripple(x, z, color = '#ffffff', size = 3) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); this.scene.add(m);
    this.items.push({ t: 1.1, max: 1.1, tick: k => { m.scale.setScalar(.3 + (1 - k) * size); m.material.opacity = k * .9; }, dispose: () => m.removeFromParent() });
  }

  bubble(obj, text, y = 1.12) {
    const t = tag(obj, `<span class="bubble">${text}</span>`, { y });
    setTimeout(() => t.remove(), 1600);
  }

  confetti(x, z, n = 70) {
    const cols = ['#ff5d6c', '#ffc727', '#55d36b', '#4fb4ff', '#9a7cff', '#ff7fc8'];
    const geo = new THREE.PlaneGeometry(.12, .08);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      m.position.set(x, 1, z);
      const v = new THREE.Vector3((Math.random() - .5) * 5, 4 + Math.random() * 4, (Math.random() - .5) * 5), spin = new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0);
      this.scene.add(m);
      this.items.push({ t: 2.4, max: 2.4, tick: (k, dt) => { v.y -= 9 * dt; v.multiplyScalar(.985); m.position.addScaledVector(v, dt); if (m.position.y < .05) { m.position.y = .05; v.set(0, 0, 0); } m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; }, dispose: () => m.removeFromParent() });
    }
  }

  // fp rows from the server: [x, y, angle, age]
  footprints(rows) {
    const n = Math.min(MAX_FP, rows.length);
    for (let i = 0; i < n; i++) {
      const [x, y, , age] = rows[rows.length - n + i];
      const k = Math.max(.05, 1 - age / 5);
      this.p.set(x * U, .025, y * U); this.s.set(k, k, 1);
      this.fp.setMatrixAt(i, this.m4.compose(this.p, this.q, this.s));
    }
    this.fp.count = n; this.fp.instanceMatrix.needsUpdate = true;
  }

  // Zzz over sleeping animals (not over seekers that ran out of water)
  sleepers(ents) {
    const want = new Set();
    for (const e of ents.ents.values()) if (e.pet && !e.seeker && (e.fl & 2) && !e.dying) want.add(e.key);
    for (const [k, t] of this.zzz) if (!want.has(k)) { t.remove(); this.zzz.delete(k); }
    for (const k of want) if (!this.zzz.has(k)) this.zzz.set(k, tag(ents.get(k).pet.root, '<span class="zzz o">Zzz</span>', { y: .95 }));
  }

  tick(dt) {
    this.items = this.items.filter(it => { it.t -= dt; if (it.t <= 0) { it.dispose(); return false; } it.tick(it.t / it.max, dt); return true; });
  }
  clear() { for (const it of this.items) it.dispose(); this.items = []; for (const t of this.zzz.values()) t.remove(); this.zzz.clear(); this.fp.count = 0; }
}
