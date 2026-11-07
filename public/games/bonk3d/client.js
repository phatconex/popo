// Bonk Island client: builds each round's island from `round`, draws every player from the 20 Hz snapshots
// (interpolated 0.1 s behind the round clock), shows splashes, ghosts, coconuts and hit effects, and runs the camera
// (spec §5.1). Own control, HUD and overlays plug in here in later steps.
import * as THREE from 'three';
import { followSun } from '../../core3d/engine.js';
import { esc } from '../../core3d/ui.js';
import { buildWorld } from './world.js';
import { Fighters, FL } from './fighters.js';
import { Fx } from './fx.js';

const BK = window.BK;
const DELAY = .1;    // others are drawn this far behind the round clock
const KEEP = 1;      // seconds of snapshots kept per player
const AHEAD = .25;   // the clock never runs further than this past the newest snapshot (round end, lag spike)
const GHOST_T = .9;  // splash -> seat on the ghost cloud
const SNAP_ERR = .3; // clock error that is corrected at once instead of nudged

let ctx = null, L = null, world = null, fighters = null, fx = null, offFrame = null;
let rd = 0, building = null, queue = [], buildId = 0; // buildId: bumped by every new round and by unmount so stale async work bails out
let clock = 0, lastC = 0, ph = '';
let camSnap = true;
const bufs = new Map();   // id -> [[c, x, z, y, f, fl, ch], ...] (BK.interp rows)
const sunk = new Set();   // ids that splashed this round
const pend = new Map();   // id -> { t, ok } ghost seat countdown (ok: the server's `out` arrived)
const outOrder = [];      // ids in the order they went out (ghost seat index)
const later = [];         // [{ t, fn }] effects delayed to line up with the interpolated bodies
const watches = [];       // bonks in progress on other screens: [{ id, c, t, hit }]
const airborne = new Map();
const camT = new THREE.Vector3(), camP = new THREE.Vector3(), tv = new THREE.Vector3();

export async function mount(c) {
  ctx = c;
  L = ctx.ui.layer('bk-game');
  offFrame = ctx.engine.onFrame(frame);
}

export function unmount() {
  if (offFrame) offFrame();
  buildId++;
  teardownRound();
  if (L) L.remove();
  L = offFrame = null; building = null; queue = []; rd = 0; ph = '';
}

export function onMsg(d) {
  if (!d) return;
  if (d.t === 'round') {
    if (d.rd === rd && (world || building)) { syncClock(d.c, true); return; } // the same round re-sent (rejoin)
    building = startRound(d).catch(e => { console.error(e); building = null; });
    return;
  }
  if (building) { queue.push(d); return; }
  handle(d);
}

export function onEmote(id, e) {
  const F = fighters && fighters.get(id);
  if (F && F.state !== 'out') { ctx.ui.emoteOn(F.g, e, F.state === 'ghost' ? 1.25 : 1.6); return; }
  const p = ctx.app.lobby && ctx.app.lobby.players.find(x => x.id === id);
  ctx.ui.toast(`<svg viewBox="0 0 48 48" style="width:26px;height:26px;vertical-align:middle"><use href="#e-${e | 0}"/></svg> ${esc(p ? p.name : '')}`);
}

// Players who left the room disappear from the island (they already went out with the server's `out`).
export function onLobby(m) {
  if (!fighters || !m || !m.players) return;
  const ids = new Set(m.players.map(p => p.id));
  for (const id of [...bufs.keys()]) if (!ids.has(id)) { fighters.remove(id); bufs.delete(id); }
}

function rosterOf(d) {
  const lp = (ctx.app.lobby && ctx.app.lobby.players) || [];
  return Object.keys(d.spawn).map(Number).map(id => {
    const p = lp.find(x => x.id === id) || { name: 'Player', av: 0 };
    return { id, av: p.av | 0, name: p.name, color: ctx.app.colorOf(id), me: id === ctx.net.myId };
  });
}

async function startRound(d) {
  const my = ++buildId, { engine } = ctx;
  const w = await buildWorld(d, engine.quality);
  if (my !== buildId || !L) { w.dispose(); return; } // a newer round (or leaving the game) took over meanwhile
  const players = rosterOf(d), fs = new Fighters(w.scene, L);
  await Promise.all(players.map(p => fs.add(p.id, p)));
  if (my !== buildId || !L) { fs.dispose(); w.dispose(); return; }
  teardownRound();
  world = w; fighters = fs; fx = new Fx(w.scene, L, engine.camera);
  world.onSplash = (x, z, big) => fx.splash(x, z, big);
  fx.solidAt = (x, z) => world.solidAt(x, z);
  rd = d.rd; ph = d.c < 0 ? 'count' : 'play';
  syncClock(d.c, true);
  for (const p of players) {
    const [x, z, f] = d.spawn[p.id];
    bufs.set(p.id, [[d.c, x, z, 0, f, 0, 0]]);
    fighters.set(p.id, { x, z, y: 0, f, fl: 0, ch: 0, ground: true }, 0, 0);
  }
  camSnap = true;
  engine.setScene(world.scene);
  ctx.app.loaded(); ctx.ui.reveal();
  building = null;
  const q = queue; queue = [];
  for (const m of q) handle(m);
}

function teardownRound() {
  if (fighters) fighters.dispose();
  if (fx) fx.dispose();
  if (world) world.dispose();
  world = fighters = fx = null;
  bufs.clear(); sunk.clear(); pend.clear(); airborne.clear();
  outOrder.length = later.length = watches.length = 0;
}

// Round clock: the newest snapshot's c plus the time since it arrived, nudged toward each new snapshot.
function syncClock(c, hard) {
  lastC = c;
  if (hard || Math.abs(c - clock) > SNAP_ERR) clock = c; else clock += (c - clock) * .1;
}

function handle(d) {
  if (!world || d.rd !== rd) return;
  switch (d.t) {
    case 's': onSnap(d); break;
    case 'out': onOut(d); break;
    case 'fx': onFx(d); break;
  }
}

function onSnap(d) {
  ph = d.ph; syncClock(d.c);
  for (const [id, x, z, y, f, fl, ch, gh] of d.p) {
    let b = bufs.get(id);
    if (!b) { if (!fighters.get(id)) continue; bufs.set(id, b = []); }
    if (b.length && d.c <= b[b.length - 1][0]) continue;
    b.push([d.c, x, z, y, f, fl, ch]);
    while (b.length > 2 && d.c - b[0][0] > KEEP) b.shift();
    // already a ghost when we got here (rejoin): straight onto the cloud, no splash
    if (gh && !pend.has(id) && !sunk.has(id)) seat(id);
  }
  for (const [x, z, landAt] of d.nuts || []) fx.nut(x, z, landAt);
}

function onOut(d) {
  if (!outOrder.includes(d.id)) outOrder.push(d.id);
  sink(d.id);
  const p = pend.get(d.id); if (p) p.ok = true;
}

// The body hits the water: seen falling through the surface, or the server said `out` first.
function sink(id) {
  if (sunk.has(id)) return;
  sunk.add(id);
  const F = fighters.get(id);
  if (F && F.state === 'alive') {
    fx.splash(F.x, F.z, 1);
    fx.pop(F.x, BK.WATER_Y + .8, F.z, 'SPLASH!', 34, '#bfe6ff');
    fighters.out(id);
  }
  pend.set(id, { t: GHOST_T, ok: outOrder.includes(id) });
}

function seat(id) {
  if (!outOrder.includes(id)) outOrder.push(id);
  sunk.add(id); pend.delete(id);
  fighters.ghost(id, outOrder.indexOf(id), world.ghostCloud);
}

const aliveOthers = id => [...bufs.keys()].filter(o => o !== id).map(o => fighters.get(o)).filter(F => F && F.state === 'alive');

function onFx(d) {
  switch (d.a) {
    case 'push': later.push({ t: DELAY, fn: () => {
      const A = fighters.get(d.id); if (!A || A.state !== 'alive') return;
      fighters.punch(d.id);
      for (const o of BK.pushTargets(A, aliveOthers(d.id))) { fx.pop(o.x, 1.2, o.z, 'Push!', 22, '#bfe6ff'); fx.stars(o.x, .7, o.z, 4, .6); }
    } }); break;
    case 'bonk': later.push({ t: DELAY, fn: () => watches.push({ id: d.id, c: Math.max(0, Math.min(1, d.c || 0)), t: BK.BONK.lungeT + .1, hit: new Set() }) }); break;
    case 'dash': later.push({ t: DELAY, fn: () => { const A = fighters.get(d.id); if (A && A.state === 'alive') fx.dust(A.x, A.z, 6); } }); break;
    case 'thunk': fx.pop(d.x, .9, d.z, 'THUNK!', 26, '#ffb36b'); fx.stars(d.x, .4, d.z, 5, .7); fx.dust(d.x, d.z, 5); fx.shake(.12); break;
    case 'splash': fx.splash(d.x, d.z, .4); break;
  }
}

// A bonk seen on this screen: the first time the lunging body's fist reaches someone, show the hit.
function stepWatches(dt) {
  for (let i = watches.length - 1; i >= 0; i--) {
    const w = watches[i], A = fighters.get(w.id);
    w.t -= dt;
    if (w.t <= 0 || !A || A.state !== 'alive') { watches.splice(i, 1); continue; }
    const att = { x: A.x, z: A.z, f: A.f, lunge: 1 }, c = w.c, mega = c > .95;
    for (const o of aliveOthers(w.id)) {
      if (w.hit.has(o.id) || !BK.bonkTouch(att, o)) continue;
      w.hit.add(o.id);
      fx.pop(o.x, 1.3, o.z, mega ? 'MEGA BONK!' : 'BONK!', 30 + c * 22, mega ? '#ff5d6c' : '#ffd23f');
      fx.stars(o.x, .8, o.z, 6 + (c * 8 | 0), 1 + c);
      fx.shake(.15 + c * .35);
    }
  }
}

function frame(dt, t) {
  if (!world) return;
  const cam = ctx.engine.camera;
  clock = Math.min(clock + dt, lastC + AHEAD);
  const ddt = fx.frozen ? 0 : dt; // hitstop freezes the bodies
  for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { const { fn } = later[i]; later.splice(i, 1); fn(); }
  world.update(dt, t, clock);
  // bodies
  const rt = clock - DELAY;
  let ax = 0, az = 0, an = 0;
  for (const [id, b] of bufs) {
    const F = fighters.get(id); if (!F) continue;
    if (F.state !== 'alive') { fighters.set(id, null, ddt, t); continue; }
    const s = BK.interp(b, rt); if (!s) continue;
    const [x, z, y, f, fl, ch] = s;
    fighters.set(id, { x, z, y, f, fl, ch, ground: world.solidAt(x, z) >= 0 }, ddt, t);
    if ((fl & FL.FALL) && y < BK.WATER_Y + .05) { sink(id); continue; }
    if (!(fl & FL.FALL)) { ax += x; az += z; an++; }
    const air = y > .02 || !!(fl & FL.AIR);
    if (airborne.get(id) && !air && !(fl & FL.FALL)) fx.dust(x, z, 3);
    airborne.set(id, air);
    if ((fl & FL.DASH) && Math.random() < .5) fx.dust(x, z, 1);
  }
  for (const [id, p] of pend) if ((p.t -= dt) <= 0 && p.ok) seat(id);
  stepWatches(dt);
  // camera: frame what is left of the island, lean a quarter toward the players still standing, ~53° from the south
  if (an) { ax /= an; az /= an; }
  const R = world.radius(clock), need = R + 1.4, k = camSnap ? 1 : Math.min(1, dt * 2);
  camT.lerp(tv.set(ax * .25, 0, az * .25 + .6), k);
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect;
  const D = Math.max(need / tanH, need * .95 / tanV) * 1.02;
  if (Number.isFinite(D)) { camP.lerp(tv.set(camT.x, D * .8, camT.z + D * .6), k); camSnap = false; } // a hidden tab reports a 0-wide window
  cam.position.copy(camP); cam.lookAt(camT);
  followSun(world.scene, camT.x, camT.z);
  // the ghost cloud floats above the island's top-right corner (tucked in on a narrow portrait screen); it scales
  // with the framed radius so it keeps its size on screen while the camera closes in on a shrinking island
  const portrait = cam.aspect < .9, gs = Math.max(.5, Math.min(1.3, need / 7.9));
  world.ghostCloud.scale.setScalar(gs);
  world.ghostCloud.position.set(camT.x + need * (portrait ? .42 : .8), 2.6 * gs, camT.z - need * (portrait ? .85 : .5));
  world.ghostCloud.rotation.y = Math.sin(t * .4) * .05;
  fx.update(dt, clock); // after the camera is placed: adds the shake
}
