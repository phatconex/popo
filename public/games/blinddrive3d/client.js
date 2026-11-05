// Blind Drive 3D client: builds the level from `init`, shows every team's car, drives your own car locally when
// you are the driver (sent to the server at 20 Hz), picks the camera by role, and feeds the HUD (hud.js).
import * as THREE from 'three';
import { followSun } from '../../core3d/engine.js';
import { buildWorld } from './world.js';
import { makeCar, TEAM_COL } from './car.js';
import { Hud } from './hud.js';
import { Overlays } from './overlays.js';
import { sfx, vibrate } from '../../core3d/sfx.js';

const BD = window.BD;
const OFF_LIMIT = 6; // metres from the centre line where the server spins you out
const INTERP_MS = 110, SEND_T = .05, SPIN_T = 2;

let ctx, L, hud, ov, podium = null, world = null, offFrame = null, building = null, gen = 0;
let st = null;            // current level: {track, teams, level, levels, theme}
let me = { team: -1, role: 'nav' }, ph = '', lt = 0;
let own = null;           // my car simulated locally while I drive: {x, z, a, v, lat}
let sendAcc = 0, spinT = 0, rumbleT = 0;
const cars = new Map();   // team id -> CarView
const snaps = [];         // [{t: ms, cars: Map(team -> [x, z, a, v, flags])}]
let queue = [];
const focusPt = { x: 0, y: 0, z: 0, a: 0 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
let camSnap = true, driverView = null;
const listeners = [];
const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

const drives = () => me.role === 'driver' || me.role === 'solo';
const avOf = id => { const p = ctx.app.lobby && ctx.app.lobby.players.find(q => q.id === id); return p ? p.av : 0; };
const nameOf = id => { const p = ctx.app.lobby && ctx.app.lobby.players.find(q => q.id === id); return p ? p.name : ''; };
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

export async function mount(c) {
  ctx = c;
  const { ui, net } = ctx;
  L = ui.layer('bd');
  L.innerHTML = '<div class="bd-frost pass"></div>';
  hud = new Hud(L, { isTouch: ctx.engine.isTouch, onSignal: k => net.game({ t: 'sig', k }) });
  ov = new Overlays(L, { sfx, isTouch: ctx.engine.isTouch });
  ui.emoteControl(L, e => net.send({ t: 'emote', e }));
  offFrame = ctx.engine.onFrame(frame);
}

export function unmount() {
  if (offFrame) offFrame();
  offFrame = null;
  for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
  listeners.length = 0;
  gen++;
  teardown();
  ov && ov.close();
  if (podium) { podium.dispose(); podium = null; }
  hud && hud.destroy();
  L && L.remove();
  L = hud = ov = null; st = null; own = null; building = null; queue = []; snaps.length = 0;
  me = { team: -1, role: 'nav' }; ph = ''; driverView = null;
  const cam = ctx.engine.camera; cam.fov = 42; cam.updateProjectionMatrix();
}

export function onMsg(d) {
  if (d.t === 'init') {
    queue = []; // only messages after the latest init belong to the level being built
    const job = startLevel(d).catch(e => {
      console.error(e);
      if (building !== job) return; // a newer init owns the build now
      building = null; queue = [];
      ctx.ui.toast("Couldn't load this level. Waiting for the next one.", '#ffd0d4', 3500);
    });
    building = job;
    return;
  }
  if (building) { queue.push(d); return; }
  handle(d);
}

export function onEmote(id, e) {
  const t = st && st.teams.find(x => x.members.includes(id)), car = t && cars.get(t.id);
  if (car && car.root.visible) ctx.ui.emoteOn(car.root, e, 2.1);
  else ctx.ui.toast(`<svg viewBox="0 0 48 48" style="width:26px;height:26px;vertical-align:middle"><use href="#e-${e | 0}"/></svg> ${ctx.ui.esc(nameOf(id))}`);
}

function teardown() {
  for (const c of cars.values()) c.dispose();
  cars.clear();
  if (world) world.dispose();
  world = null;
}

async function startLevel(d) {
  const my = ++gen, { engine } = ctx;
  const same = world && st && st.track.seed === d.track.seed && st.level === d.level;
  if (!same) { // build the new level first, so the old one stays on screen meanwhile
    const w = await buildWorld(d.track, engine.quality);
    if (my !== gen) { w.dispose(); return; }
    teardown();
    world = w;
  } else { for (const c of cars.values()) c.dispose(); cars.clear(); }
  st = { track: d.track, teams: d.teams.map(t => ({ ...t, got: (t.got || []).slice() })), level: d.level, levels: d.levels, theme: d.theme, start: d.start };
  me = d.me; ph = d.ph; lt = d.t0 || 0; snaps.length = 0; spinT = 0; sendAcc = 0; rumbleT = 0;
  const views = await Promise.all(st.teams.map(t => makeCar(TEAM_COL[t.id] || TEAM_COL[0], avOf(t.driver))));
  if (my !== gen) { views.forEach(v => v.dispose()); return; }
  st.teams.forEach((t, k) => { cars.set(t.id, views[k]); world.scene.add(views[k].root); ridersOf(t); });
  const mine = st.teams.find(t => t.id === me.team);
  if (mine) {
    for (const k of mine.got) hideStop(k);
    for (const k of mine.taken || []) if (world.coins[k]) world.coins[k].visible = false;
  }
  const sp = d.start.find(s => s[0] === me.team);
  own = drives() && sp ? { x: sp[1], z: sp[2], a: sp[3], v: 0, lat: 0 } : null;
  hud.setLevel(st, me); syncRole();
  camSnap = true; driverView = null;
  if (podium) { podium.dispose(); podium = null; L.classList.remove('final'); }
  ov.close();
  engine.setScene(world.scene);
  if (d.ph === 'ready') ov.getReady(d.level, d.levels, d.theme, st.teams.map(t => ({ id: t.id, name: t.name, driver: nameOf(t.driver), callers: t.members.filter(m => m !== t.driver).map(nameOf) })), me);
  ctx.app.loaded(); ctx.ui.reveal();
  building = null;
  const q = queue; queue = [];
  const lastS = [...q].reverse().find(m => m.t === 's');
  for (const m of q) if (m.t !== 's' || m === lastS) handle(m);
}

function ridersOf(t) {
  const v = cars.get(t.id);
  if (v) v.setRiders(t.got.map(k => st.track.stops[k].kind));
}
function hideStop(k) {
  const s = world && world.stops[k];
  if (s) { s.ring.visible = false; s.pet.root.visible = false; }
}

function handle(d) {
  if (!world || !st) return;
  switch (d.t) {
    case 's': {
      ph = d.ph;
      snaps.push({ t: performance.now(), cars: new Map(d.cars.map(c => [c[0], c])) });
      while (snaps.length > 40) snaps.shift();
      hud.update(d, me);
      ov.phase(d);
      const mine = d.cars.find(c => c[0] === me.team);
      if (mine && drives()) {
        if (!own || ph !== 'race') own = { x: mine[1], z: mine[2], a: mine[3], v: ph === 'race' ? mine[4] : 0, lat: 0 };
        if (mine[5] & 1 && spinT <= 0) spinT = .2; // spinning on the server: hold still until it ends
      }
      break;
    }
    case 'fix':
      if (own) Object.assign(own, { x: d.x, z: d.z, a: d.a, v: d.v, lat: 0 });
      break;
    case 'roles': {
      const was = new Map(st.teams.map(t => [t.id, t.driver]));
      st.teams = st.teams.filter(t => d.teams.some(x => x.id === t.id));
      for (const t of st.teams) { const x = d.teams.find(y => y.id === t.id); t.driver = x.driver; t.members = x.members; }
      for (const [id, v] of cars) if (!st.teams.some(t => t.id === id)) { v.dispose(); cars.delete(id); }
      me = d.me;
      if (!drives()) own = null;
      syncRole();
      // a new driver: rebuild that car with the new driver's animal at the wheel
      for (const t of st.teams) if (was.get(t.id) !== t.driver) {
        const my = gen;
        makeCar(TEAM_COL[t.id], avOf(t.driver)).then(v => {
          if (my !== gen || !st.teams.includes(t)) { v.dispose(); return; }
          const old = cars.get(t.id); if (old) old.dispose();
          cars.set(t.id, v); world.scene.add(v.root); ridersOf(t);
        });
      }
      break;
    }
    case 'fx': {
      const t = st.teams.find(x => x.id === d.team);
      if (d.kind === 'pick' && t) {
        if (!t.got.includes(d.i)) t.got.push(d.i);
        ridersOf(t);
        if (d.team === me.team) {
          hideStop(d.i);
          const code = st.track.stops[d.i].kind, a = window.ANIMALS[code];
          sfx.animal(a ? a.id : 'pig');
          hud.feed(`${ctx.ui.esc(a ? a.name : 'A passenger')} climbed in!`, '#ffe9a6');
        }
      } else if (d.kind === 'finish') {
        if (t && t.members.includes(ctx.net.myId)) ov.finishBanner(d.i);
      } else if (d.kind === 'coin' && d.team === me.team) {
        if (world.coins[d.i]) world.coins[d.i].visible = false;
        sfx.beep(1320, .12, 'triangle', .1, 500);
      } else if (d.kind === 'spin') {
        const v = cars.get(d.team); if (v) v.spin(SPIN_T);
        if (d.team === me.team) {
          if (own) spinT = SPIN_T;
          sfx.splash();
          if (drives()) vibrate(120);
          hud.feed('Spin-out! Hold on…', '#ffd0d4');
        }
      }
      break;
    }
    case 'level': ov.levelResults(d.rows, d.level, st.levels); break;
    case 'final': showPodium(d); break;
    case 'sig': hud.showSignal(d.k, nameOf(d.from)); break;
    case 'sent': hud.sent(d.k); break;
  }
}

// Pose of a team's car `INTERP_MS` behind the newest snapshot (or the start grid before any snapshot).
const scratch = { x: 0, z: 0, a: 0 };
const pose = (x, z, a) => { scratch.x = x; scratch.z = z; scratch.a = a; return scratch; }; // valid until the next call
function interp(team, now) {
  const rt = now - INTERP_MS;
  let i = snaps.length - 1;
  while (i > 0 && snaps[i].t > rt) i--;
  const a = snaps[i] && snaps[i].cars.get(team), bs = snaps[i + 1], b = bs && bs.cars.get(team);
  if (!a) { const s = st.start.find(x => x[0] === team); return s ? { x: s[1], z: s[2], a: s[3] } : null; }
  if (!b || snaps[i].t > rt) return pose(a[1], a[2], a[3]);
  const k = Math.min(1, (rt - snaps[i].t) / (bs.t - snaps[i].t || 1));
  let da = b[3] - a[3]; da = Math.atan2(Math.sin(da), Math.cos(da));
  return pose(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + da * k);
}

// Role, team name and partner names for the HUD.
function syncRole() {
  const t = st.teams.find(x => x.id === me.team);
  const partners = !t ? [] : me.role === 'nav' ? [nameOf(t.driver)] : t.members.filter(id => id !== ctx.net.myId).map(nameOf);
  hud.setRole(me.role, t ? t.name : 'No', partners);
}

// What the driver can feel: crossing animals on the road ahead (<= 12 m), slicks ahead (<= 8 m), the grass edge
// near the 6 m limit. Returns 0..1 closeness only, never a direction.
function nearby(env) {
  const tr = st.track, fx = Math.sin(own.a), fz = Math.cos(own.a);
  let d = 0;
  for (const c of tr.crossers || []) {
    const p = BD.crosserPos(tr, c, lt);
    if (!p.onRoad) continue;
    const dx = p.x - own.x, dz = p.z - own.z, dist = Math.hypot(dx, dz);
    if (dx * fx + dz * fz > 0 && dist < 12) d = Math.max(d, 1 - dist / 12);
  }
  for (const sl of tr.slicks || []) {
    const dx = sl.x - own.x, dz = sl.z - own.z, dist = Math.hypot(dx, dz);
    if ((dx * fx + dz * fz > 0 || env.slick) && dist < 8) d = Math.max(d, 1 - dist / 8);
  }
  d = Math.max(d, Math.max(0, Math.min(1, env.edge + tr.rw - (OFF_LIMIT - 1)))); // the last metre before the off-road limit
  return d;
}

function drive(dt) {
  if (!own) { hud.speed(0); hud.danger(0); return; }
  if (ph !== 'race') { hud.speed(0); hud.danger(0); return; }
  const env = BD.envAt(st.track, own.x, own.z, own.a);
  hud.danger(nearby(env)); hud.syncButtons();
  const slope = env.slope;
  hud.feel(env.slick ? 'Slippery!' : env.off ? 'Off road!' : slope > .06 ? 'Uphill' : slope < -.06 ? 'Downhill' : 'Flat',
    env.slick ? '#4fb4ff' : env.off ? '#ff5d6c' : slope > .06 ? '#ff8a4c' : slope < -.06 ? '#9a7cff' : '#55b360');
  if (spinT > 0) { spinT -= dt; own.v = 0; own.lat = 0; hud.speed(0); return; }
  const inp = hud.input();
  BD.stepCar(own, inp, env, dt);
  hud.speed(own.v);
  rumbleT -= dt; // rumble on grass
  if (env.off && Math.abs(own.v) > .5 && rumbleT <= 0) { rumbleT = .12; sfx.beep(60 + Math.random() * 25, .1, 'sawtooth', .05); }
  sendAcc = Math.min(sendAcc + dt, SEND_T * 2);
  if (sendAcc >= SEND_T) {
    sendAcc -= SEND_T;
    ctx.net.game({ t: 'car', x: r2(own.x), z: r2(own.z), a: r3(own.a), v: r2(own.v), g: inp.gas, b: inp.brake });
  }
}

function setView(drv) {
  if (driverView === drv) return;
  driverView = drv; camSnap = true;
  world.setDriverView(drv);
  L.classList.toggle('drv', drv);
}

async function showPodium(d) {
  const my = gen, o = ov, lobby = ctx.app.lobby;
  L.classList.add('final');
  const p = await o.podium(d.rows, { players: lobby ? lobby.players : [], engine: ctx.engine, alive: () => my === gen && !podium });
  if (!p) return;
  if (my !== gen) { p.dispose(); return; }
  podium = p;
  ctx.engine.setScene(p.scene);
}

function frame(dt, t) {
  if (podium) { podium.tick(dt, t); return; }
  if (!world || !st || building) return;
  const now = performance.now(), hills = st.track.hills || [], cam = ctx.engine.camera;
  lt += dt;
  drive(dt);
  setView(me.role === 'driver');
  // cars
  let focus = null;
  const focusTeam = me.team >= 0 ? me.team : st.teams.length ? st.teams[0].id : -1;
  for (const [team, v] of cars) {
    const p = team === me.team && own ? own : interp(team, now);
    if (!p) continue;
    const y = BD.heightAt(hills, p.x, p.z), pitch = Math.atan(BD.slopeAlong(hills, p.x, p.z, p.a));
    v.setPose(p.x, p.z, p.a, y, pitch);
    v.tick(dt);
    const mineCar = team === me.team;
    v.root.visible = mineCar || !driverView;
    v.setGhost(!mineCar && me.team >= 0);
    if (team === focusTeam) focus = Object.assign(focusPt, { x: p.x, y, z: p.z, a: p.a });
  }
  world.tick(dt, lt, focus);
  // camera: navigator 10 m behind, 9.5 m up, looking 4.5 m ahead; driver 4.6 m behind, 2.7 m up
  if (focus) {
    const fx = Math.sin(focus.a), fz = Math.cos(focus.a);
    if (driverView) { wantPos.set(focus.x - fx * 4.6, focus.y + 2.7, focus.z - fz * 4.6); wantLook.set(focus.x + fx * 3, focus.y + .2, focus.z + fz * 3); }
    else { wantPos.set(focus.x - fx * 10, focus.y + 9.5, focus.z - fz * 10); wantLook.set(focus.x + fx * 4.5, focus.y, focus.z + fz * 4.5); }
    const k = camSnap ? 1 : Math.min(1, dt * (driverView ? 8 : 4));
    camSnap = false;
    camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
    cam.position.copy(camPos); cam.lookAt(camLook);
    followSun(world.scene, focus.x, focus.z);
  }
  const fov = cam.aspect < .9 ? 62 : 45;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
