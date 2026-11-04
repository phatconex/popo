// Hide & Seek 3D client: builds the world from `init`, renders snapshots, sends input, shows HUD and overlays.
import * as THREE from 'three';
import { followSun } from '../../core3d/engine.js';
import { ANIMALS } from '../../core3d/assets.js';
import { buildWorld, U } from './world.js';
import { Entities } from './entities.js';
import { Fx, SOUND } from './fx.js';
import { Hud, KEYMAP } from './hud.js';
import { Overlays } from './overlays.js';

let ctx, L, hud, ov, world = null, ents = null, fx = null, podium = null;
let st = null, snap = null, seed = null, building = null, queue = [], offFrame = null;
const keys = {};
let firing = null, lastShot = 0, lastInput = '', lastInputT = 0, aim = new THREE.Vector3(), aimOk = false, reticle = null;
const camT = new THREE.Vector3();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const listeners = [];
const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

export async function mount(c) {
  ctx = c;
  const { ui, engine, sfx } = ctx;
  L = ui.layer('hs');
  hud = new Hud(L, { isTouch: engine.isTouch, onAction: act });
  ov = new Overlays(L, { sfx, isTouch: engine.isTouch });
  ui.emoteControl(L, e => ctx.net.send({ t: 'emote', e }));
  on(window, 'keydown', e => { if (e.repeat) return; keys[e.code] = true; const a = KEYMAP[e.code]; if (a && a !== 'run') act(a); });
  on(window, 'keyup', e => { keys[e.code] = false; });
  on(window, 'blur', () => { for (const k in keys) keys[k] = false; });
  const cv = engine.renderer.domElement;
  on(cv, 'pointermove', e => { if (!engine.isTouch) setAim(e.clientX, e.clientY); });
  on(cv, 'pointerdown', e => { if (e.button > 0) return; firing = e.pointerId; setAim(e.clientX, e.clientY); shoot(); });
  on(cv, 'pointermove', e => { if (firing === e.pointerId && ctx.engine.isTouch) setAim(e.clientX, e.clientY); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) on(cv, ev, e => { if (firing === e.pointerId) firing = null; });
  offFrame = engine.onFrame(frame);
}

export function unmount() {
  if (offFrame) offFrame();
  for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
  listeners.length = 0;
  teardownWorld();
  if (podium) { podium.dispose(); podium = null; }
  ov && ov.closeRound();
  hud && hud.destroy();
  L && L.remove();
  L = hud = ov = null; st = snap = null; seed = null; queue = []; building = null;
}

export function onMsg(d) {
  if (d.t === 'init') { building = startRound(d); return; }
  if (building) { queue.push(d); return; }
  handle(d);
}
export function onEmote(id, e) {
  if (!ents) return;
  const s = ents.get('k' + id);
  if (s && s.pet) ctx.ui.emoteOn(s.pet.root, e, 1.5);
  else if (id === ctx.net.myId && snap && snap.me.role === 'hider') { const o = ents.get('e' + snap.me.eid); if (o && o.pet) ctx.ui.emoteOn(o.pet.root, e, 1.35); }
  else ctx.ui.toast(`<svg viewBox="0 0 48 48" style="width:26px;height:26px;vertical-align:middle"><use href="#e-${e}"/></svg> ${(ctx.app.lobby.players.find(p => p.id === id) || {}).name || ''}`);
}

function teardownWorld() {
  if (ents) ents.clear(); if (fx) fx.clear();
  if (world) world.dispose();
  world = ents = fx = reticle = null;
}

async function startRound(d) {
  const { engine } = ctx;
  if (podium) { podium.dispose(); podium = null; }
  L.classList.remove('final');
  ov.closeRound();
  st = { role: d.role, round: d.round, total: d.total, map: d.map };
  if (seed !== d.map.seed || !world) {
    teardownWorld();
    world = await buildWorld(d.map, engine.quality);
    seed = d.map.seed;
    ents = new Entities(world.scene);
    fx = new Fx(world.scene);
    reticle = new THREE.Group();
    for (const [r, c] of [[.32, '#ffffff'], [.18, '#ff5d6c']]) { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + .1, 32), new THREE.MeshBasicMaterial({ color: c, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .05 + r * .01; reticle.add(m); }
    reticle.visible = false; world.scene.add(reticle);
    camT.set(d.map.spawn.x * U, 0, d.map.spawn.y * U);
    ov.roleCard(d.role, d.round, d.total, d.map.theme);
  } else ents.clear(); // same round re-sent (rejoin): rebuild entities from the next snapshot
  engine.setScene(world.scene);
  ctx.app.loaded();
  building = null;
  const q = queue; queue = [];
  const lastS = [...q].reverse().find(m => m.t === 's');
  for (const m of q) if (m.t !== 's' || m === lastS) handle(m);
}

function myKey() {
  if (!snap) return null;
  const me = snap.me;
  if (me.role === 'seeker') return 'k' + ctx.net.myId;
  return me.alive ? 'e' + me.eid : null;
}

function handle(d) {
  if (!world) return;
  const { sfx, app, net } = ctx;
  switch (d.t) {
    case 's': {
      snap = d;
      const me = d.me, canSeeMates = me.role === 'hider' || !me.alive;
      const mates = new Map(canSeeMates && d.mates ? d.mates.filter(([eid]) => eid !== me.eid).map(([eid, name]) => ['e' + eid, name]) : []);
      ents.update(d, performance.now(), { ownKey: myKey(), mates, colors: id => app.colorOf(id) });
      fx.footprints(d.fp || []);
      hud.update(d);
      ov.phase(d);
      break;
    }
    case 'fx': {
      if (d.kind === 'shot') {
        fx.shot(d.x1, d.y1, d.x2, d.y2, d.hit); sfx.splash();
        if (d.hit === 1) {
          const e = ents.nearest(d.x2 * U, d.y2 * U);
          if (e && e.pet) { fx.bubble(e.pet.root, SOUND[ANIMALS[e.code].id] || 'Hey!'); ents.play(e.key, 'gesture-negative', 1); }
          if (d.by === net.myId) { hud.feed(d.free ? 'Frenzy! Free shot' : 'Oops! A real animal · <b style="color:#ff5d6c">−15 water</b>', '#ffd0d4'); sfx.oops(); }
        } else if (d.hit === 2) {
          fx.confetti(d.x2 * U, d.y2 * U, 50); sfx.caught();
          const mine = snap && snap.me.role === 'hider' && d.vid === net.myId;
          hud.feed(mine ? `<b>${d.seeker}</b> caught you!` : `<b>${d.seeker}</b> caught <b>${d.name}</b>!`, '#ffe9a6');
        }
      } else if (d.kind === 'say') {
        const e = ents.nearest(d.x * U, d.y * U);
        if (e && e.pet) fx.bubble(e.pet.root, SOUND[ANIMALS[d.skin] && ANIMALS[d.skin].id] || 'Hi!');
        sfx.pop();
      } else if (d.kind === 'listen') fx.ripple(d.x * U, d.y * U, '#bfe6ff', 6);
      else if (d.kind === 'down') hud.feed(`<b>${d.name}</b> ran out of water!`, '#cfe7ff');
      break;
    }
    case 'sense': hud.feed(['All quiet around here.', 'Someone is <b>nearby</b>…', 'Someone is <b>very close</b>!'][d.level], '#cfe7ff'); break;
    case 'round': {
      const lobby = app.lobby, players = lobby ? lobby.players : [];
      const myRole = snap ? snap.me.role : '';
      d.winner === myRole ? sfx.win() : sfx.lose();
      ov.round(d, players, net.myId, d.last ? () => showPodium(d) : null);
      break;
    }
  }
}

async function showPodium(d) {
  const { engine, app, net } = ctx;
  L.classList.add('final');
  podium = await ov.podium(d, app.lobby ? app.lobby.players : [], net.myId, engine, () => {});
  engine.setScene(podium.scene);
}

function act(id) {
  if (!snap || !snap.me.alive) return;
  const role = snap.me.role;
  if (role === 'hider' && ['swap', 'say', 'sleep', 'decoy'].includes(id)) { ctx.net.game({ t: id === 'swap' ? 'skin' : id }); ctx.sfx.click(); }
  if (role === 'seeker' && id === 'listen') { ctx.net.game({ t: 'listen' }); ctx.sfx.click(); }
}

function setAim(cx, cy) {
  const cam = ctx.engine.camera;
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  aimOk = !!ray.ray.intersectPlane(ground, aim);
}
function shoot() {
  if (!snap || snap.me.role !== 'seeker' || !snap.me.alive || snap.ph !== 'playing' || !aimOk) return;
  const now = performance.now(); if (now - lastShot < 120) return; lastShot = now;
  ctx.net.game({ t: 'shoot', x: Math.round(aim.x / U), y: Math.round(aim.z / U) });
}

function sendInput(now) {
  if (!snap) return;
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + hud.joy.x;
  let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + hud.joy.y;
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  const run = !!(keys.ShiftLeft || keys.ShiftRight || hud.runHeld);
  let ang;
  const mine = ents && ents.get(myKey());
  if (snap.me.role === 'seeker' && mine && mine.pet && aimOk) {
    const p = mine.pet.root.position;
    ang = Math.atan2(aim.z - p.z, aim.x - p.x);
    mine.aimHeading = Math.atan2(aim.x - p.x, aim.z - p.z);
  }
  const o = { t: 'in', mx: +mx.toFixed(2), my: +my.toFixed(2), run };
  if (ang != null) o.ang = +ang.toFixed(2);
  const js = JSON.stringify(o);
  if (js !== lastInput && now - lastInputT > 50 || now - lastInputT > 400) { ctx.net.game(o); lastInput = js; lastInputT = now; }
}

function frame(dt, t) {
  if (podium) { podium.tick(dt, t); return; }
  if (!world || !snap) return;
  const now = performance.now(), cam = ctx.engine.camera, me = snap.me;
  sendInput(now);
  if (firing != null && snap.fz) shoot(); // Frenzy: hold to keep squirting
  ents.tick(dt, now, cam);
  fx.tick(dt); fx.sleepers(ents);
  world.tick(dt);
  // camera: my animal, or the seeker while spectating
  let focus = null;
  const mine = ents.get(myKey());
  if (mine && mine.pet) focus = mine.pet.root.position;
  else { const sk = snap.k.find(k => k[6]) || snap.k[0]; const e = sk && ents.get('k' + sk[0]); if (e && e.pet) focus = e.pet.root.position; }
  if (focus) camT.lerp(focus, Math.min(1, dt * 4));
  const portrait = cam.aspect < .9, seeker = me.role === 'seeker';
  const H = (seeker ? 13.5 : 11.5) * (portrait ? 1.75 : 1), Z = (seeker ? 8.5 : 7.5) * (portrait ? 1.35 : 1);
  cam.position.set(camT.x, H, camT.z + Z); cam.lookAt(camT.x, 0, camT.z - (portrait ? 1 : .5));
  followSun(world.scene, camT.x, camT.z);
  if (me.alive && mine && mine.pet) world.covers.update(mine.pet.root.position.x, mine.pet.root.position.z);
  else world.covers.update(-99, -99);
  reticle.visible = seeker && me.alive && snap.ph === 'playing' && aimOk && !ctx.engine.isTouch;
  if (reticle.visible) reticle.position.set(aim.x, 0, aim.z);
}
