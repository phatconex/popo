// Animals on the map: herd animals + hiders (indistinguishable, keyed by eid) and seekers (keyed by player id).
// Positions are interpolated ~110 ms behind the newest snapshot so movement stays smooth at 20 updates/s.
import * as THREE from 'three';
import { pet } from '../../core3d/assets.js';
import { tag } from '../../core3d/ui.js';
import { U } from './world.js';

const DELAY = 110;
const PET_H = .75;

function ring(color, r = .5) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + .12, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .035; m.renderOrder = 2;
  return m;
}
function waterGun() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.18, .2, .5), new THREE.MeshStandardMaterial({ color: '#4fb4ff' }));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .22, 14), new THREE.MeshStandardMaterial({ color: '#ffd23f' }));
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .2, 8), new THREE.MeshStandardMaterial({ color: '#ff5d6c' }));
  tank.position.set(0, .18, -.05); noz.rotation.x = Math.PI / 2; noz.position.set(0, 0, .34);
  g.add(body, tank, noz); g.position.set(.24, .42, .3); g.scale.setScalar(.85);
  return g;
}

export class Entities {
  constructor(scene) {
    this.scene = scene;
    this.ents = new Map();
    this.ownKey = null; this.mates = new Map(); this.colors = () => '#ff5d6c';
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4(); this.v = new THREE.Vector3();
  }
  count() { return this.ents.size; }
  get(key) { return this.ents.get(key); }

  // s: snapshot from the server. opts: { ownKey, mates: Map(key → name), colors(id) }
  update(s, now, opts) {
    const seen = new Set();
    for (const [eid, x, y, skin, flip, fl] of s.e) { const key = 'e' + eid; seen.add(key); this.track(key, now, x, y, skin, fl, null); }
    for (const [id, name, x, y, hp, ang, alive, av] of s.k) { const key = 'k' + id; seen.add(key); this.track(key, now, x, y, av, alive ? 0 : 2, { id, name, hp, ang, alive }); }
    for (const [key, ent] of this.ents) if (!seen.has(key) && !ent.dying) this.kill(ent);
    if (opts) {
      if (opts.ownKey !== this.ownKey) { const old = this.ents.get(this.ownKey); if (old) this.decorate(old); this.ownKey = opts.ownKey; }
      const matesChanged = [...opts.mates.keys()].join() !== [...this.mates.keys()].join();
      this.mates = opts.mates; this.colors = opts.colors;
      for (const ent of this.ents.values()) if (matesChanged || ent.key === this.ownKey) this.decorate(ent);
    }
  }

  track(key, now, x, y, code, fl, seeker) {
    let ent = this.ents.get(key);
    if (!ent) { ent = { key, code: -1, buf: [], heading: 0, idleT: 0, eatT: 0, upd: 0, seeker: null }; this.ents.set(key, ent); }
    ent.buf.push({ t: now, x: x * U, z: y * U, fl });
    if (ent.buf.length > 12) ent.buf.shift();
    ent.fl = fl; ent.seeker = seeker;
    if (ent.code !== code) this.setModel(ent, code);
    if (seeker && ent.tagEl) ent.tagEl.el.firstElementChild.textContent = seeker.alive ? seeker.name : `${seeker.name} (empty)`;
  }

  async setModel(ent, code) {
    ent.code = code;
    const p = await pet(code, ent.key[0] === 'k' ? .85 : PET_H);
    if (ent.code !== code || ent.dead) { p.dispose(); return; }
    const old = ent.pet;
    ent.pet = p;
    const last = ent.buf[ent.buf.length - 1];
    p.root.position.set(last.x, 0, last.z);
    p.root.rotation.y = old ? old.root.rotation.y : Math.random() * 6.3;
    if (old) { old.dispose(); ent.anim = ''; }
    this.scene.add(p.root);
    this.decorate(ent);
    if (old) { ent.pop = 1; }
  }

  // own ring + "You" label, mate labels, seeker gun/ring/name
  decorate(ent) {
    if (!ent.pet) return;
    const root = ent.pet.root;
    for (const c of [...root.children]) if (c.userData.deco) c.removeFromParent();
    if (ent.tagEl) { ent.tagEl.remove(); ent.tagEl = null; }
    const add = o => { o.userData.deco = true; root.add(o); return o; };
    if (ent.seeker) {
      const col = this.colors(ent.seeker.id);
      add(ring(col, .46)); add(waterGun());
      ent.tagEl = tag(root, `<span class="nametag" style="background:${col}">${ent.seeker.name}</span>`, { y: 1.2 });
    } else if (ent.key === this.ownKey) {
      add(ring('#ffffff', .4)).userData.self = true;
      ent.tagEl = tag(root, '<span class="nametag hs-self" style="background:#4fb4ff">You</span>', { y: 1.08 });
    } else if (this.mates.has(ent.key)) {
      add(ring('#9fe6ff', .38));
      ent.tagEl = tag(root, `<span class="nametag hs-mate" style="background:#3fa9d8">${this.mates.get(ent.key)}</span>`, { y: 1.08 });
    }
  }

  kill(ent) { ent.dying = .45; }

  // Where an entity is right now (world units), or null.
  pos(key) { const e = this.ents.get(key); return e && e.pet ? e.pet.root.position : null; }

  tick(dt, now, camera) {
    const rt = now - DELAY;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    for (const [key, ent] of this.ents) {
      const p = ent.pet;
      if (ent.dying != null) {
        ent.dying -= dt;
        if (p) { const k = Math.max(.01, ent.dying / .45); p.root.scale.set(k, k * (1 + (1 - k)), k); p.root.position.y += dt * 2; }
        if (ent.dying <= 0) { ent.dead = true; if (p) p.dispose(); if (ent.tagEl) ent.tagEl.remove(); this.ents.delete(key); }
        continue;
      }
      if (!p) continue;
      // interpolate (own avatar: chase the newest position for snappier control)
      const b = ent.buf;
      let x, z;
      if (key === this.ownKey || b.length < 2) { const l = b[b.length - 1]; const k = Math.min(1, dt * 14); x = p.root.position.x + (l.x - p.root.position.x) * k; z = p.root.position.z + (l.z - p.root.position.z) * k; }
      else {
        let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--;
        const a = b[Math.max(0, i - 1)], c = b[i], span = c.t - a.t || 1, k = Math.max(0, Math.min(1, (rt - a.t) / span));
        x = a.x + (c.x - a.x) * k; z = a.z + (c.z - a.z) * k;
      }
      const dx = x - p.root.position.x, dz = z - p.root.position.z, sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
      if (Math.abs(dx) + Math.abs(dz) > 3) { p.root.position.set(x, 0, z); } // teleport (rejoin / new round)
      else { p.root.position.x = x; p.root.position.z = z; }
      if (sp > .08) ent.heading = Math.atan2(dx, dz);
      else if (ent.seeker && ent.aimHeading == null) ent.heading = Math.atan2(Math.cos(ent.seeker.ang), Math.sin(ent.seeker.ang));
      if (ent.aimHeading != null && sp < .08) ent.heading = ent.aimHeading;
      let d = ent.heading - p.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); p.root.rotation.y += d * Math.min(1, dt * 10);
      if (ent.pop > 0) { ent.pop = Math.max(0, ent.pop - dt * 4); const q = 1 + Math.sin(ent.pop * Math.PI) * .3; p.root.scale.set(q, 1.25 - .25 * q, q); }
      // animation from movement + flags (1 = stunned, 2 = sleeping/out)
      let want;
      if (ent.fl & 1) want = 'gesture-negative';
      else if (ent.fl & 2) want = 'static';
      else if (sp > 1.15) want = 'run';
      else if (sp > .12) { want = 'walk'; ent.idleT = 0; }
      else { ent.idleT += dt; if (ent.eatT > 0) { ent.eatT -= dt; want = 'eat'; } else if (ent.idleT > 2.5 && Math.random() < dt * .3) { ent.eatT = 2 + Math.random() * 2; ent.idleT = 0; want = 'eat'; } else want = 'idle'; }
      if (ent.forceAnim) { want = ent.forceAnim.name; if ((ent.forceAnim.t -= dt) <= 0) ent.forceAnim = null; }
      if (want !== ent.anim) { p.play(want, .18); ent.anim = want; }
      // mixer: skip off-screen, slow down far away
      this.v.set(x, .5, z);
      if (!this.frustum.containsPoint(this.v)) continue;
      ent.upd += dt;
      const far = this.v.distanceToSquared(camera.position) > 22 * 22;
      if (far && ent.upd < 1 / 15) continue;
      p.mixer.update(ent.upd); ent.upd = 0;
    }
  }

  play(key, name, t = 1) { const e = this.ents.get(key); if (e) e.forceAnim = { name, t }; }
  clear() { for (const e of this.ents.values()) { e.dead = true; if (e.pet) e.pet.dispose(); if (e.tagEl) e.tagEl.remove(); } this.ents.clear(); this.ownKey = null; }
  // nearest entity to a world point (for sound bubbles)
  nearest(x, z) { let best = null, bd = Infinity; for (const e of this.ents.values()) { if (!e.pet || e.dying) continue; const p = e.pet.root.position, d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = e; } } return best; }
}
