// Bonk Island effects: water splashes (rings and droplets), star bursts, dust puffs, pop-up words, falling coconuts
// with their growing red shadow, camera shake and hitstop. Looks and numbers copy the approved mockup.
import * as THREE from 'three';
import { h } from '../../core3d/ui.js';
import { quality } from '../../core3d/engine.js';

const BK = window.BK;
const TAU = Math.PI * 2;
const NUT_R = .3; // coconut centre height when it rests on a tile

export class Fx {
  // layer: the game's UI layer (pop-up words go there). camera: used to place words and to shake.
  constructor(scene, layer, camera) {
    this.scene = scene; this.camera = camera;
    this.box = h('<div class="bk-pops pass"></div>'); layer.appendChild(this.box);
    this.parts = []; this.nuts = new Map(); this.done = new Set(); this.timers = new Set(); // done: coconuts already gone
    this.shakeA = 0; this.stopT = 0;
    this.solidAt = () => 0; // (x, z) -> -1 | surface; the client hooks the world in so landed coconuts bounce only on tiles
    this.sph = new THREE.SphereGeometry(1, 8, 6); this.star = new THREE.OctahedronGeometry(1, 0);
    this.ringGeo = new THREE.RingGeometry(.5, .75, 28); this.ringGeo.rotateX(-Math.PI / 2);
    this.shGeo = new THREE.CircleGeometry(.6, 24); this.shGeo.rotateX(-Math.PI / 2);
    const B = c => new THREE.MeshBasicMaterial({ color: c });
    this.M = { white: B('#ffffff'), yellow: B('#ffd23f'), drop: B('#c8f1ff'), dust: new THREE.MeshLambertMaterial({ color: '#fff7e6' }),
      nut: new THREE.MeshLambertMaterial({ color: '#7a4a2a' }), leaf: new THREE.MeshLambertMaterial({ color: '#55d36b' }) };
    this.v = new THREE.Vector3();
  }

  part(geo, mat, x, y, z, vx, vy, vz, s, life, g = 0, grow = false) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.setScalar(s); this.scene.add(m);
    this.parts.push({ m, vx, vy, vz, s, life, max: life, g, grow });
  }

  // Droplets and a widening foam ring where something hit the water. big: 1 for a player, .5 a tile, .4 a coconut.
  splash(x, z, big = 1) {
    const Y = BK.WATER_Y;
    for (let i = 0; i < 14 * big; i++) {
      const a = Math.random() * TAU, sp = .6 + Math.random() * 2;
      this.part(this.sph, i % 2 ? this.M.drop : this.M.white, x, Y + .1, z, Math.cos(a) * sp, 3.5 + Math.random() * 3.5 * big, Math.sin(a) * sp, .1 + Math.random() * .08, 1.1, 14);
    }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, depthWrite: false }));
    ring.position.set(x, Y + .14, z); this.scene.add(ring);
    this.parts.push({ m: ring, ring: true, life: 1, max: 1, grow: 2 + 2 * Math.min(1, big) }); // a player's ring widens 5x, a tile's 4x
  }

  stars(x, y, z, n = 5, p = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 2.5 + Math.random() * 3 * p;
      this.part(this.star, i % 3 ? this.M.yellow : this.M.white, x, y, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, .09 + Math.random() * .06, .45 + Math.random() * .2, 9);
    }
  }

  dust(x, z, n = 5) {
    for (let i = 0; i < n; i++) this.part(this.sph, this.M.dust, x + (Math.random() - .5) * .4, .15, z + (Math.random() - .5) * .4, (Math.random() - .5) * 1.2, .6, (Math.random() - .5) * 1.2, .12, .45, 0, true);
  }

  // A word that pops up at a world point (BONK!, MEGA BONK!, Push!, THUNK!, SPLASH!).
  pop(x, y, z, text, size = 30, color = '#ffd23f') {
    this.v.set(x, y, z).project(this.camera);
    if (this.v.z > 1) return;
    const el = h(`<div class="bk-pop o"></div>`); el.textContent = text;
    el.style.cssText = `left:${(this.v.x * .5 + .5) * innerWidth}px;top:${(-this.v.y * .5 + .5) * innerHeight}px;font-size:${size}px;color:${color}`;
    this.box.appendChild(el);
    const tm = setTimeout(() => { el.remove(); this.timers.delete(tm); }, 800); this.timers.add(tm);
  }

  // A coconut from a snapshot: falls from NUT.h to land at round time landAt. Called again with the same values
  // on every snapshot; only the first call creates it.
  nut(x, z, landAt) {
    const k = x + ',' + z + ',' + landAt;
    if (this.nuts.has(k) || this.done.has(k)) return;
    const m = new THREE.Group();
    const ball = new THREE.Mesh(this.sph, this.M.nut); ball.scale.setScalar(.28); ball.castShadow = quality.shadows; m.add(ball);
    const leaf = new THREE.Mesh(this.sph, this.M.leaf); leaf.scale.set(.16, .05, .08); leaf.position.y = .28; m.add(leaf);
    const sh = new THREE.Mesh(this.shGeo, new THREE.MeshBasicMaterial({ color: '#ff5d6c', transparent: true, opacity: .2, depthWrite: false }));
    sh.position.set(x, .03, z); sh.scale.setScalar(.35);
    m.position.set(x, BK.NUT.h, z); this.scene.add(m, sh);
    this.nuts.set(k, { m, sh, x, z, landAt, landed: false, y: BK.NUT.h, vx: 0, vy: 0, vz: 0, t: 0 });
  }

  shake(a) { this.shakeA = Math.max(this.shakeA, a); }
  // Freeze effects for ms (the client also freezes its own motion while `frozen`).
  hitstop(ms) { this.stopT = Math.max(this.stopT, ms / 1000); }
  get frozen() { return this.stopT > 0; }

  // Call once per frame after the camera is placed (the shake moves it). c: round clock.
  update(dt, c) {
    if (this.stopT > 0) { this.stopT -= dt; dt = 0; }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { p.m.removeFromParent(); if (p.ring) p.m.material.dispose(); this.parts.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.ring) { p.m.scale.setScalar(1 + (1 - k) * p.grow); p.m.material.opacity = .9 * k; continue; }
      p.vy -= p.g * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5;
      p.m.scale.setScalar(p.grow ? p.s * (1 + (1 - k) * 2.5) * Math.min(1, k * 3) : p.s * Math.min(1, k * 2.2));
    }
    const N = BK.NUT;
    for (const [key, n] of this.nuts) {
      if (!n.landed) {
        const e = n.landAt - c; // seconds until it lands
        n.y = Math.min(N.h, NUT_R + .5 * N.g * Math.max(0, e) * e);
        n.m.position.set(n.x, n.y, n.z); n.m.rotation.x += dt * 5;
        const k = Math.max(0, Math.min(1, 1 - n.y / N.h)); n.sh.scale.setScalar(.35 + k * .75); n.sh.material.opacity = .2 + k * .4;
        if (e > 0) continue;
        // landed: the server's thunk / splash fx draws the impact; on a tile the coconut bounces away
        n.landed = true; n.sh.removeFromParent(); n.sh.material.dispose();
        if (this.solidAt(n.x, n.z) < 0) { n.m.removeFromParent(); this.nuts.delete(key); this.done.add(key); continue; }
        n.y = NUT_R; n.vy = 3; n.vx = (Math.random() - .5) * 3; n.vz = (Math.random() - .5) * 3;
      }
      n.t += dt; n.vy -= N.g * dt; n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      if (n.y < NUT_R && this.solidAt(n.x, n.z) >= 0) { n.y = NUT_R; n.vy = Math.abs(n.vy) * .35; n.vx *= .7; n.vz *= .7; }
      n.m.position.set(n.x, n.y, n.z); n.m.rotation.x += dt * 5;
      if (n.t > 1.6) n.m.scale.setScalar(Math.max(.01, 1 - (n.t - 1.6) * 4));
      if (n.y < BK.WATER_Y) this.splash(n.x, n.z, .4);
      if (n.y < BK.WATER_Y || n.t > 1.85) { n.m.removeFromParent(); this.nuts.delete(key); this.done.add(key); }
    }
    this.shakeA *= Math.exp(-7 * Math.max(dt, 1 / 120));
    if (this.shakeA > .002) { const s = this.shakeA, cp = this.camera.position; cp.x += (Math.random() - .5) * s; cp.y += (Math.random() - .5) * s; }
  }

  dispose() {
    for (const p of this.parts) { p.m.removeFromParent(); if (p.ring) p.m.material.dispose(); }
    for (const n of this.nuts.values()) { n.m.removeFromParent(); if (!n.landed) { n.sh.removeFromParent(); n.sh.material.dispose(); } }
    for (const tm of this.timers) clearTimeout(tm);
    this.parts = []; this.nuts.clear(); this.done.clear(); this.timers.clear(); this.box.remove();
    this.sph.dispose(); this.star.dispose(); this.ringGeo.dispose(); this.shGeo.dispose();
    for (const m of Object.values(this.M)) m.dispose();
  }
}
