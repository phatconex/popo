// Blind Drive 3D client: builds the level from `init`, shows every team's car, drives your own car locally when
// you are the driver (sent to the server at 20 Hz), and picks the camera by role. HUD and overlays come later;
// for now a small role chip in the corner.
import * as THREE from 'three';
import { followSun } from '../../core3d/engine.js';
import { buildWorld } from './world.js';
import { makeCar, TEAM_COL } from './car.js';

const BD = window.BD;
const INTERP_MS = 110, SEND_T = .05, SPIN_T = 2;
const css = `
.bd-role{position:absolute;top:14px;left:14px;padding:6px 14px 8px;border-radius:16px;font-size:20px;color:#fff;line-height:1.05;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 var(--ink),0 0 0 4px var(--ink);text-shadow:0 2px 0 rgba(20,30,50,.35)}
.bd-role small{display:block;font-size:13px;opacity:.95}
.bd-frost{position:absolute;inset:0;display:none;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  -webkit-mask-image:radial-gradient(ellipse 22% 22% at 50% 62%,transparent 55%,#000 100%);mask-image:radial-gradient(ellipse 22% 22% at 50% 62%,transparent 55%,#000 100%);
  background:radial-gradient(ellipse 34% 30% at 50% 62%,rgba(236,243,250,0) 40%,rgba(236,243,250,.92) 100%)}
.bd.drv .bd-frost{display:block}
.bd .emote-btn{top:84px;bottom:auto}.bd .emote-panel{top:150px;bottom:auto}`;

let ctx, L, style, roleEl, world = null, offFrame = null, building = null, gen = 0;
let st = null;            // current level: {track, teams, level, levels, theme}
let me = { team: -1, role: 'nav' }, ph = '', lt = 0;
let own = null;           // my car simulated locally while I drive: {x, z, a, v, lat}
let sendAcc = 0, spinT = 0, lastSig = null, roleHtml = '';
const cars = new Map();   // team id -> CarView
const snaps = [];         // [{t: ms, cars: Map(team -> [x, z, a, v, flags])}]
let queue = [];
const keys = {};
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
  style = ui.h(`<style>${css}</style>`); document.head.appendChild(style);
  L = ui.layer('bd');
  L.innerHTML = '<div class="bd-frost pass"></div><div class="bd-role pass"></div>';
  roleEl = L.querySelector('.bd-role');
  ui.emoteControl(L, e => net.send({ t: 'emote', e }));
  on(window, 'keydown', e => { keys[e.code] = true; });
  on(window, 'keyup', e => { keys[e.code] = false; });
  on(window, 'blur', () => { for (const k in keys) keys[k] = false; });
  offFrame = ctx.engine.onFrame(frame);
}

export function unmount() {
  if (offFrame) offFrame();
  offFrame = null;
  for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
  listeners.length = 0;
  gen++;
  teardown();
  L && L.remove(); style && style.remove();
  L = style = roleEl = null; roleHtml = ''; st = null; own = null; building = null; queue = []; snaps.length = 0;
  me = { team: -1, role: 'nav' }; ph = ''; driverView = null;
  const cam = ctx.engine.camera; cam.fov = 42; cam.updateProjectionMatrix();
}

export function onMsg(d) {
  if (d.t === 'init') { building = startLevel(d).catch(e => { console.error(e); building = null; }); return; }
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
  me = d.me; ph = d.ph; lt = d.t0 || 0; snaps.length = 0; spinT = 0; sendAcc = 0; lastSig = null;
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
  camSnap = true; driverView = null;
  engine.setScene(world.scene);
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
      if (d.kind === 'pick' && t) { if (!t.got.includes(d.i)) t.got.push(d.i); ridersOf(t); if (d.team === me.team) hideStop(d.i); }
      else if (d.kind === 'coin' && d.team === me.team && world.coins[d.i]) world.coins[d.i].visible = false;
      else if (d.kind === 'spin') { const v = cars.get(d.team); if (v) v.spin(SPIN_T); if (d.team === me.team && own) spinT = SPIN_T; }
      break;
    }
    case 'sig': lastSig = d.k; break;
  }
}

// Pose of a team's car `INTERP_MS` behind the newest snapshot (or the start grid before any snapshot).
function interp(team, now) {
  const rt = now - INTERP_MS;
  let i = snaps.length - 1;
  while (i > 0 && snaps[i].t > rt) i--;
  const a = snaps[i] && snaps[i].cars.get(team), bs = snaps[i + 1], b = bs && bs.cars.get(team);
  if (!a) { const s = st.start.find(x => x[0] === team); return s ? { x: s[1], z: s[2], a: s[3] } : null; }
  if (!b || snaps[i].t > rt) return { x: a[1], z: a[2], a: a[3] };
  const k = Math.min(1, (rt - snaps[i].t) / (bs.t - snaps[i].t || 1));
  let da = b[3] - a[3]; da = Math.atan2(Math.sin(da), Math.cos(da));
  return { x: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, a: a[3] + da * k };
}

function drive(dt) {
  if (!own || ph !== 'race') return;
  if (spinT > 0) { spinT -= dt; own.v = 0; own.lat = 0; return; }
  const steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const inp = { steer, gas: keys.KeyW || keys.ArrowUp ? 1 : 0, brake: keys.KeyS || keys.ArrowDown ? 1 : 0, rev: keys.KeyR ? 1 : 0 };
  BD.stepCar(own, inp, BD.envAt(st.track, own.x, own.z, own.a), dt);
  sendAcc += dt;
  if (sendAcc >= SEND_T) {
    sendAcc = 0;
    ctx.net.game({ t: 'car', x: r2(own.x), z: r2(own.z), a: r3(own.a), v: r2(own.v), g: inp.gas, b: inp.brake });
  }
}

function setView(drv) {
  if (driverView === drv) return;
  driverView = drv; camSnap = true;
  world.setDriverView(drv);
  L.classList.toggle('drv', drv);
}

function frame(dt) {
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
    if (team === focusTeam) focus = { x: p.x, y, z: p.z, a: p.a };
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
  // role chip (the HUD replaces this later)
  const t = st.teams.find(x => x.id === me.team);
  const role = me.role === 'driver' ? 'DRIVER' : me.role === 'solo' ? 'SOLO DRIVER' : 'NAVIGATOR';
  const sub = `${t ? t.name + ' team' : 'Watching'} · Level ${st.level}/${st.levels} · ${ph}${lastSig != null && me.role === 'driver' ? ' · signal ' + lastSig : ''}`;
  const html = `${role}<small>${ctx.ui.esc(sub)}</small>`;
  if (roleHtml !== html) { roleHtml = html; roleEl.innerHTML = html; }
  roleEl.style.background = t ? TEAM_COL[t.id] : '#8c96a8';
}
