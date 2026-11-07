// Bonk Island fighters: one animated pet per player with its pose (charge lean and squash, lunge lean, stun wobble,
// tumble while flying or falling), daze stars, charge ring, shadow, name tag, own facing arrow, and its seat on the
// ghost cloud once knocked out. Poses come from the `fl` bits of spec §4.2; the look copies the approved mockup.
import * as THREE from 'three';
import { pet } from '../../core3d/assets.js';
import { tag, esc } from '../../core3d/ui.js';

const TAU = Math.PI * 2;
export const FL = { CHARGE: 1, STUN: 2, LUNGE: 4, DASH: 8, AIR: 16, FALL: 32 };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Fighters {
  // layer: the game's UI layer (name tags themselves go through ui.tag, which follows 3D objects).
  constructor(scene, layer) {
    this.scene = scene; this.layer = layer;
    this.all = new Map();
    this.shGeo = new THREE.CircleGeometry(.42, 20); this.shGeo.rotateX(-Math.PI / 2);
    this.shMat = new THREE.MeshBasicMaterial({ color: '#1d3346', transparent: true, opacity: .28, depthWrite: false });
    this.starGeo = new THREE.OctahedronGeometry(1, 0);
    this.starMat = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    const tri = new THREE.Shape(); tri.moveTo(0, .3); tri.lineTo(.2, 0); tri.lineTo(-.2, 0); tri.closePath();
    this.arrowGeo = new THREE.ShapeGeometry(tri); this.arrowGeo.rotateX(Math.PI / 2);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: '#ffc727', transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide });
  }

  // Load the pet and build its parts. Resolves once the fighter can be drawn.
  async add(id, { av, name, color, me }) {
    const p = await pet(av, .85);
    if (this.dead || this.all.has(id)) { p.dispose(); return; }
    const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt); tilt.add(p.root); this.scene.add(g);
    const sh = new THREE.Mesh(this.shGeo, this.shMat); this.scene.add(sh);
    const rg = new THREE.RingGeometry(.58, .74, 40, 1); rg.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide }));
    ring.visible = false; this.scene.add(ring);
    const daze = new THREE.Group(); daze.position.y = 1.05; daze.visible = false; g.add(daze);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(this.starGeo, this.starMat); s.scale.setScalar(.09); s.position.set(Math.cos(k * TAU / 3) * .3, 0, Math.sin(k * TAU / 3) * .3); daze.add(s); }
    let arrow = null;
    if (me) { arrow = new THREE.Mesh(this.arrowGeo, this.arrowMat); arrow.visible = false; this.scene.add(arrow); }
    const tg = tag(g, `<span class="nametag bk-tag${me ? ' bk-me' : ''}" style="background:${color}">${esc(name)}</span>`, { y: 1.3 });
    this.all.set(id, { id, me: !!me, pet: p, g, tilt, sh, ring, rg, daze, arrow, tag: tg, state: 'alive', x: 0, z: 0, y: 0, f: 0, sp: 0, spin: 0, punchT: 0, seat: null, seatI: 0, ghostMats: null });
  }

  // The fighter record ({ x, y, z, f, state: 'alive' | 'out' | 'ghost', g, pet, ... }) or undefined.
  get(id) { return this.all.get(id); }

  // Draw one fighter for this frame. s: { x, z, y, f, fl, ch, ground } (ground: standing over a solid tile;
  // defaults to "not falling"). Ghosts only bob on their cloud and out fighters stay hidden, whatever s says.
  set(id, s, dt, t) {
    const F = this.all.get(id); if (!F) return;
    F.pet.mixer.update(dt);
    if (F.state === 'ghost') { F.g.position.y = F.seat[1] + Math.sin(t * 2.2 + F.seatI) * .07; return; }
    if (F.state !== 'alive' || !s) return;
    const fl = s.fl | 0, falling = !!(fl & FL.FALL), stun = !!(fl & FL.STUN), charging = !!(fl & FL.CHARGE);
    const tumble = falling || (stun && (s.y > .001 || !!(fl & FL.AIR)));
    const ground = s.ground ?? !falling;
    // speed from how far it moved (snapshots are interpolated, so this is smooth); jumps (respawn, fix) reset it
    const moved = Math.hypot(s.x - F.x, s.z - F.z);
    if (moved > 3) F.sp = 0; else if (dt > 0) F.sp += (moved / dt - F.sp) * Math.min(1, dt * 12);
    F.x = s.x; F.z = s.z; F.y = s.y; F.f = s.f;
    F.g.position.set(s.x, s.y, s.z); F.g.rotation.y = s.f;
    // animation
    const p = F.pet;
    if (tumble) p.play('idle');
    else if (F.sp > 3 && !stun) p.play('run');
    else if (F.sp > .5 && !stun) p.play('walk');
    else p.play('idle');
    // lean / tumble / wobble
    let rx = 0, rz = 0, sq = 0;
    if (tumble) { F.spin += dt * (falling ? 7 : 12); rx = F.spin; } else F.spin = 0;
    if (!tumble && stun) rz = Math.sin(t * 18) * .2;
    else if (!tumble && charging) { rx = -.45 * (s.ch || 0); sq = s.ch || 0; }
    else if (!tumble && ((fl & FL.LUNGE) || F.punchT > 0)) rx = .5;
    F.punchT = Math.max(0, F.punchT - dt);
    const tl = F.tilt;
    if (tumble) tl.rotation.x = rx; else tl.rotation.x += angDiff(rx, tl.rotation.x) * Math.min(1, dt * 16);
    tl.rotation.z = rz;
    const wob = charging && s.ch >= 1 ? Math.sin(t * 40) * .03 : 0;
    p.root.scale.set(1 + .14 * sq + wob, 1 - .14 * sq, 1 + .14 * sq + wob);
    F.daze.visible = stun && !falling; F.daze.rotation.y += dt * 6;
    const onG = ground && !falling;
    F.sh.visible = onG; F.sh.position.set(s.x, .03, s.z); F.sh.scale.setScalar(1 / (1 + Math.max(0, s.y) * .6));
    F.ring.visible = charging && !tumble; F.ring.position.set(s.x, .05, s.z);
    if (F.ring.visible) {
      F.rg.setDrawRange(0, Math.round(Math.min(1, s.ch || 0) * 40) * 6);
      F.ring.material.color.set(s.ch >= 1 && Math.sin(t * 30) > 0 ? '#ff5d6c' : '#ffd23f');
    }
    if (F.arrow) {
      F.arrow.visible = onG;
      F.arrow.position.set(s.x + Math.sin(s.f) * .62, .05, s.z + Math.cos(s.f) * .62); F.arrow.rotation.y = s.f;
    }
  }

  // Lean forward for a moment (a push).
  punch(id) { const F = this.all.get(id); if (F) F.punchT = .16; }

  // Knocked out: hide the body and everything under it (the client shows the splash).
  out(id) {
    const F = this.all.get(id); if (!F || F.state !== 'alive') return;
    F.state = 'out';
    F.g.visible = F.sh.visible = F.ring.visible = F.daze.visible = false;
    if (F.arrow) F.arrow.visible = false;
    if (F.tag) { F.tag.remove(); F.tag = null; }
  }

  // Sit the fighter on the ghost cloud at seatIndex, half see-through. cloud.userData.seats: [[x, y, z], ...].
  ghost(id, seatIndex, cloud) {
    const F = this.all.get(id); if (!F || F.state === 'ghost') return;
    this.out(id);
    F.state = 'ghost';
    // pets share materials between clones: give this one its own see-through copies
    F.ghostMats = [];
    F.pet.root.traverse(m => {
      if (!m.isMesh) return;
      const c = (Array.isArray(m.material) ? m.material : [m.material]).map(mt => { const x = mt.clone(); x.transparent = true; x.opacity = .5; x.depthWrite = false; F.ghostMats.push(x); return x; });
      m.material = Array.isArray(m.material) ? c : c[0];
      m.castShadow = false;
    });
    const seats = cloud.userData.seats, seat = seats[seatIndex % seats.length];
    F.seat = seat; F.seatI = seatIndex;
    cloud.add(F.g); F.g.visible = true;
    F.g.position.set(seat[0], seat[1], seat[2]); F.g.rotation.set(0, (seatIndex % 3 - 1) * .25, 0);
    F.tilt.rotation.set(0, 0, 0); F.pet.root.scale.setScalar(1); F.daze.visible = false;
    F.pet.play('idle');
  }

  remove(id) {
    const F = this.all.get(id); if (!F) return;
    this.all.delete(id);
    F.pet.dispose(); F.g.removeFromParent(); F.sh.removeFromParent(); F.ring.removeFromParent();
    F.rg.dispose(); F.ring.material.dispose();
    if (F.arrow) F.arrow.removeFromParent();
    if (F.tag) F.tag.remove();
    if (F.ghostMats) for (const m of F.ghostMats) m.dispose();
  }

  dispose() {
    this.dead = true;
    for (const id of [...this.all.keys()]) this.remove(id);
    this.shGeo.dispose(); this.shMat.dispose(); this.starGeo.dispose(); this.starMat.dispose(); this.arrowGeo.dispose(); this.arrowMat.dispose();
  }
}
