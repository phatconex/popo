// Bonk Island client: builds each round's island from `round`, runs your own animal here with the shared physics
// (instant control, "what you see is what you hit", spec §4.1) and reports it to the server, draws everyone else from
// the 20 Hz snapshots (interpolated 0.1 s behind the round clock), shows splashes, ghosts, coconuts and hit effects,
// and runs the camera (spec §5.1). The HUD (hud.js) buttons and joystick drive the same paths as the keyboard through
// press / release / setMove; status() tells it cooldowns and whether you are a ghost. The HUD's data (roster, feed,
// edge timer, sounds) is gathered here.
import * as THREE from 'three';
import { followSun } from '../../core3d/engine.js';
import { esc } from '../../core3d/ui.js';
import { buildWorld } from './world.js';
import { Fighters, FL } from './fighters.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { Overlays } from './overlays.js';
import { podium as makePodium } from '../../core3d/podium.js';

const BK = window.BK;
const DELAY = .1;    // others are drawn this far behind the round clock
const KEEP = 1;      // seconds of snapshots kept per player
const AHEAD = .25;   // the clock never runs further than this past the newest snapshot (round end, lag spike)
const GHOST_T = .9;  // splash -> seat on the ghost cloud
const SNAP_ERR = .3; // clock error that is corrected at once instead of nudged
const ST_MS = 50;    // own state goes out at 20 Hz on average, at most one per frame and never two within 25 ms
const NUT_SLACK = .1;                  // s on top of the coconut cooldown: the server checks it on its own clock with no slack
const CD_PAD = .08;                    // s on top of the push / bonk / dash cooldowns: the server checks them on its 20 Hz tick
                                       // clock (±50 ms), so bunched packets after a delay spike are not refused
const DASH_HIT = BK.BODY_R * 2 + .05;  // a dash hits whoever it overlaps
const MEGA = .95;                      // bonk charge shown as MEGA BONK!
const KEYS = { KeyJ: 'push', KeyK: 'bonk', Space: 'dash', KeyL: 'dash' };
const GHOST_KEYS = new Set(['KeyJ', 'KeyK', 'Space']);
const r2 = v => Math.round(v * 100) / 100;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

let ctx = null, L = null, hud = null, ov = null, podium = null, resT = 0, finalT = 0, finalRows = null, world = null, fighters = null, fx = null, offFrame = null, reticle = null;
let rd = 0, buildRd = 0, building = null, queue = [], buildId = 0; // buildId: bumped by every new round and by unmount so stale async work bails out
let clock = 0, lastC = 0, ph = '', ended = false;
let camSnap = true;
const bufs = new Map();   // others: id -> [[c, x, z, y, f, fl, ch], ...] (BK.interp rows); your own animal is never in here
const sunk = new Set();   // ids that splashed this round
const pend = new Map();   // id -> { t, ok } ghost seat countdown (ok: the server's `out` arrived)
const outOrder = [];      // ids in the order they went out (ghost seat index)
const later = [];         // [{ t, fn }] effects delayed to line up with the interpolated bodies
const watches = [];       // bonks in progress on other screens: [{ id, c, t, hit }]
const airborne = new Map();
const unknown = new Set(); // ids built before the lobby knew their name / avatar
// HUD data
let roster = [];           // this round's players: [{ id, name, me }] (names are refreshed from the lobby)
let roundOf = 0;
let breaks = [];           // [[q, r, warnAt, dropAt], ...] from `round`
const kos = new Map();     // id -> knock-outs this round, counted from `out` messages (roundEnd rows replace them)
const warned = new Set();  // warnAt values already announced in the feed
const lastOn = new Map();  // id -> [x, z]: where each body last stood on the ground (a tile that has dropped since = sank with the edge)
const camT = new THREE.Vector3(), camP = new THREE.Vector3(), tv = new THREE.Vector3();

// ---- your own animal ----
let myId = 0, me = null;  // me: a BK body (null when you have no animal this round)
let seq = 0;              // act number q: 1, 2, ... within a round
let cur = null;           // the bonk or dash that can still hit: { a, q, c, done: Set }
let fellSent = false;
let sync = '';            // '' | 'snap': new round, wait for a snapshot | 'any': tab came back, wait for a fix or a snapshot
let away = false;         // the tab came back: our motion is from before the pause, which the server has played out since
let hiddenAt = 0, knockAt = 0;
let nextStAt = 0;         // performance.now() when the next st is due
const cdUntil = { push: 0, bonk: 0, dash: 0, nut: 0 }; // performance.now() when each action is ready again
const ret = { x: 0, z: 0 };                         // ghost reticle
const keys = new Set(), move = { x: 0, z: 0 };      // move: joystick vector (Task 8), wins over the keys while non-zero
let others = [];          // living others as drawn this frame: [{ id, x, z, y, f }] (hit tests, body separation)
const listeners = [];
const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

export async function mount(c) {
  ctx = c;
  L = ctx.ui.layer('bk-game');
  hud = new Hud(L, { isTouch: ctx.engine.isTouch, onPress: press, onRelease: release, onMove: setMove });
  hud.idle(true);
  ov = new Overlays(L, { sfx: ctx.sfx });
  ctx.ui.emoteControl(L, e => ctx.net.send({ t: 'emote', e }));
  on(window, 'keydown', onKeyDown);
  on(window, 'keyup', onKeyUp);
  on(window, 'blur', releaseAll);
  on(document, 'visibilitychange', onVisibility);
  offFrame = ctx.engine.onFrame(frame);
}

export function unmount() {
  if (offFrame) offFrame();
  buildId++;
  for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
  listeners.length = 0;
  clearTimeout(resT); clearTimeout(finalT); finalRows = null;
  if (podium) { podium.dispose(); podium = null; }
  teardownRound();
  if (ov) ov.dispose();
  if (hud) hud.destroy();
  if (L) L.remove();
  hud = ov = L = offFrame = null; roster = []; breaks = []; building = null; queue = []; rd = buildRd = 0; ph = '';
  keys.clear(); move.x = move.z = 0;
}

export function onMsg(d) {
  if (!d) return;
  if (d.t === 'round') {
    if (finalRows || podium) return; // the match is over: the podium shows (or is coming), never the island again
    if (building ? d.rd === buildRd : world && d.rd === rd) { // the same round re-sent (rejoin): a fix follows
      if (!building) { syncClock(d.c, true); if (myMode() === 'alive' && !sync) sync = 'any'; }
      return;
    }
    newRound(d);
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

// Players who left the room disappear from the island (they already went out with the server's `out`); players the
// round was built without (lobby not known yet) get their real name and animal.
export function onLobby(m) {
  if (!fighters || !m || !m.players) return;
  applyLobby(m.players);
}

// ---- input API (keyboard here; HUD buttons and joystick in Task 8) ----
// a: 'push' | 'bonk' (hold) | 'dash' | 'nut' (ghost). Does nothing when the action is not available.
export function press(a) {
  if (!world || !me) return;
  if (a === 'push') doPush();
  else if (a === 'bonk') bonkStart();
  else if (a === 'dash') doDash();
  else if (a === 'nut') doNut();
}
export function release(a) { if (a === 'bonk') bonkRelease(); }
// Joystick vector, screen-aligned: x right, z down (toward the camera); length 0..1. setMove(0, 0) hands back to the keys.
export function setMove(x, z) { move.x = Number.isFinite(x) ? x : 0; move.z = Number.isFinite(z) ? z : 0; }
// For the HUD: mode 'none' | 'alive' | 'falling' | 'out' | 'ghost', seconds until each action is ready, bonk charge 0..1.
export function status() {
  const now = performance.now(), left = a => Math.max(0, (cdUntil[a] - now) / 1000);
  return { mode: myMode(), push: left('push'), bonk: left('bonk'), dash: left('dash'), nut: left('nut'), charge: me && me.charging ? me.charge : 0 };
}

function onKeyDown(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.code;
  if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault(); // no page scroll (held keys repeat too)
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  keys.add(k);
  if (myMode() === 'ghost') { if (GHOST_KEYS.has(k)) press('nut'); return; }
  if (KEYS[k]) press(KEYS[k]);
}
function onKeyUp(e) {
  keys.delete(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyK') release('bonk');
}
// Focus lost (alt-tab, hidden tab): drop held keys and cancel a bonk charge without firing it (no act, no cooldown).
function releaseAll() { keys.clear(); move.x = move.z = 0; if (me && me.charging) { me.charging = false; me.charge = 0; } }
// A hidden tab gets no frames: the server takes over the body after 1 s. Coming back, wait for its word first.
function onVisibility() {
  if (document.hidden) { releaseAll(); hiddenAt = performance.now(); }
  else if (myMode() === 'alive' && !sync) { sync = 'any'; away = knockAt < hiddenAt; } // a knock that came meanwhile still counts
}

function inputVec() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (move.x || move.z) { x = move.x; z = move.z; }
  const n = Math.hypot(x, z);
  return n > 1 ? [x / n, z / n] : n < .15 ? [0, 0] : [x, z];
}

// ---- round build ----
function rosterOf(d) {
  const lp = (ctx.app.lobby && ctx.app.lobby.players) || [];
  return Object.keys(d.spawn).map(Number).map(id => {
    const p = lp.find(x => x.id === id);
    return { id, av: p ? p.av | 0 : 0, name: p ? p.name : 'Player', color: ctx.app.colorOf(id), me: id === ctx.net.myId, known: !!p };
  });
}

function newRound(d) {
  buildRd = d.rd;
  const p = startRound(d)
    .catch(e => { console.error(e); if (L) ctx.ui.toast("Couldn't load this round", '#ffd0d4'); })
    .finally(() => {
      if (building !== p) return; // a newer round (or leaving the game) took over: the queue is theirs
      building = null;
      // After a failed build the old round stays: handle() drops the new round's messages by rd.
      const q = queue; queue = [];
      for (const m of q) handle(m);
    });
  building = p;
}

async function startRound(d) {
  const my = ++buildId, { engine } = ctx;
  let w = null, fs = null;
  try {
    w = await buildWorld(d, engine.quality);
    if (my !== buildId || !L) return; // a newer round (or leaving the game) took over meanwhile
    const players = rosterOf(d);
    fs = new Fighters(w.scene, L);
    await Promise.all(players.map(p => fs.add(p.id, p)));
    if (my !== buildId || !L) return;
    teardownRound();
    install(d, w, fs, players);
    w = fs = null; // the round owns them now
  } finally {
    if (fs) fs.dispose();
    if (w) w.dispose();
    if (my === buildId && L) { ctx.app.loaded(); ctx.ui.reveal(); } // also after a failure: never leave the cover up
  }
}

function install(d, w, fs, players) {
  world = w; fighters = fs; fx = new Fx(w.scene, L, ctx.engine.camera);
  world.onSplash = (x, z, big) => fx.splash(x, z, big);
  fx.solidAt = (x, z) => world.solidAt(x, z);
  reticle = makeReticle(); world.scene.add(reticle);
  rd = d.rd; ph = d.c < 0 ? 'count' : 'play'; ended = false;
  clearTimeout(resT); clearTimeout(finalT); finalRows = null; ov.reset();
  syncClock(d.c, true);
  roundOf = d.of | 0; breaks = Array.isArray(d.breaks) ? d.breaks : [];
  roster = players.map(p => ({ id: p.id, name: p.name, me: p.me }));
  myId = ctx.net.myId;
  for (const p of players) {
    const [x, z, f] = d.spawn[p.id];
    if (p.me) me = BK.newBody(x, z, f);
    else bufs.set(p.id, [[d.c, x, z, 0, f, 0, 0]]);
    if (!p.known) unknown.add(p.id);
    fighters.set(p.id, { x, z, y: 0, f, fl: 0, ch: 0, ground: true }, 0, 0);
  }
  seq = d.c > 0 ? Math.ceil(d.c * 10) : 0; // joined mid-round (reload): never reuse the q of acts sent before
  sync = me ? 'snap' : '';
  camSnap = true;
  ctx.engine.setScene(world.scene);
}

function teardownRound() {
  if (fighters) fighters.dispose();
  if (fx) fx.dispose();
  if (reticle) { reticle.removeFromParent(); reticle.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); reticle.userData.mat.dispose(); }
  if (world) world.dispose();
  world = fighters = fx = reticle = null;
  bufs.clear(); sunk.clear(); pend.clear(); airborne.clear(); unknown.clear(); kos.clear(); warned.clear(); lastOn.clear();
  outOrder.length = later.length = watches.length = 0;
  me = null; cur = null; fellSent = false; sync = ''; away = false; others = [];
  nextStAt = 0;
  for (const k in cdUntil) cdUntil[k] = 0;
  ret.x = ret.z = 0;
}

function makeReticle() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#9a7cff', transparent: true, opacity: .95, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 32), mat), dot = new THREE.Mesh(new THREE.CircleGeometry(.18, 16), mat);
  ring.rotation.x = dot.rotation.x = -Math.PI / 2;
  g.add(ring, dot); g.visible = false; g.userData.mat = mat;
  return g;
}

function applyLobby(players) {
  const byId = new Map(players.map(p => [p.id, p]));
  for (const id of [...bufs.keys()]) if (!byId.has(id)) { fighters.remove(id); bufs.delete(id); unknown.delete(id); }
  for (const id of [...unknown]) { const p = byId.get(id); if (p) { unknown.delete(id); refit(id, p); } }
}

// Rebuild one fighter with its real name and animal, in the state it is in now.
async function refit(id, p) {
  const fs = fighters;
  fs.remove(id);
  try { await fs.add(id, { av: p.av | 0, name: p.name, color: ctx.app.colorOf(id), me: id === myId }); } catch (e) { console.error(e); return; }
  if (fs !== fighters || !fs.get(id) || !sunk.has(id)) return;
  if (pend.has(id)) fs.out(id); else fs.ghost(id, outOrder.indexOf(id), world.ghostCloud);
}

// Round clock: the newest snapshot's c plus the time since it arrived, nudged toward each new snapshot.
function syncClock(c, hard) {
  lastC = c;
  if (hard || Math.abs(c - clock) > SNAP_ERR) clock = c; else clock += (c - clock) * .1;
}

// ---- messages ----
function send(o) { ctx.net.game({ rd, ...o }); }

function handle(d) {
  if (!world || d.rd !== rd) return;
  switch (d.t) {
    case 's': onSnap(d); break;
    case 'out': onOut(d); break;
    case 'fx': onFx(d); break;
    case 'knock': onKnock(d); break;
    case 'fix': onFix(d); break;
    case 'roundEnd': if (ended) break; for (const r of d.rows || []) kos.set(r.id, r.ko | 0); ended = true; onRoundEnd(d); break; // the server's counts win; once (rejoin re-sends it)
    case 'final': ended = true; finalRows = d.rows || []; break;
  }
}

function onSnap(d) {
  ph = d.ph; syncClock(d.c);
  // the server lists everybody still in the game: whoever is missing left (rejoin: `round` still lists them)
  for (const id of [...bufs.keys()]) if (!d.p.some(r => r[0] === id)) { fighters.remove(id); bufs.delete(id); unknown.delete(id); }
  for (const [id, x, z, y, f, fl, ch, gh] of d.p) {
    if (gh && fighters.get(id)) ghostSeen(id);
    if (id === myId) { mySnap(x, z, y, f, fl, gh); continue; }
    let b = bufs.get(id);
    if (!b) { if (!fighters.get(id)) continue; bufs.set(id, b = []); }
    if (b.length && d.c <= b[b.length - 1][0]) continue;
    b.push([d.c, x, z, y, f, fl, ch]);
    while (b.length > 2 && d.c - b[0][0] > KEEP) b.shift();
  }
  for (const [x, z, landAt] of d.nuts || []) fx.nut(x, z, landAt);
}

// The server lists id as a ghost: seat it now (we got here after it went out: rejoin), or let its splash seat it.
function ghostSeen(id) {
  const p = pend.get(id);
  if (p) p.ok = true; else if (!sunk.has(id)) seat(id);
}

// Our own row: only used to resync (new round, tab back) and to follow a fall the server decided on its own.
function mySnap(x, z, y, f, fl, gh) {
  if (!me || gh || myMode() !== 'alive') { if (gh) sync = ''; return; }
  if ((fl & FL.FALL) && !me.falling) {
    Object.assign(me, { x, z, y, falling: true, charging: false, charge: 0, lunge: 0, dash: 0 });
    fellSent = true; cur = null; sync = '';
    return;
  }
  if (sync) {
    Object.assign(me, { x, z, y, f });
    if (away) Object.assign(me, { vx: 0, vz: 0, vy: 0, lunge: 0, dash: 0 });
    sync = ''; away = false;
  }
}

function onOut(d) {
  const first = !outOrder.includes(d.id);
  if (first) { outFeed(d); outSound(d); }
  if (!outOrder.includes(d.id)) outOrder.push(d.id);
  if (d.id === myId && me) { me.falling = true; cur = null; sync = ''; }
  sink(d.id);
  const p = pend.get(d.id); if (p) p.ok = true;
}

// ---- round end: big words, results card, and after the last round the shared podium ----
const RES_AT = 1100, RES_LAST = 4000; // ms: the card comes after the big words; on the last round it stays this long
function onRoundEnd(d) {
  const { sfx } = ctx, rows = d.rows || [];
  if (d.win === myId) { ov.big('YOU WIN!<small>Last paw standing</small>', 1000); sfx.win(); }
  else if (d.win) ov.big(`${esc(nameOf(d.win).toUpperCase())} WINS!<small>Last paw standing</small>`, 1000);
  else ov.big('DRAW!', 1000);
  clearTimeout(resT); clearTimeout(finalT);
  resT = setTimeout(() => {
    if (!ov) return;
    ov.results(rows, rows.map(r => ({ id: r.id, name: nameOf(r.id), color: ctx.app.colorOf(r.id) })), myId, d.rd, roundOf);
    if (d.last) finalT = setTimeout(showPodium, RES_LAST);
  }, RES_AT);
}

async function showPodium() {
  if (!ov || !world || podium) return;
  const my = buildId, lp = (ctx.app.lobby && ctx.app.lobby.players) || [];
  const rows = (finalRows || []).map(r => ({ id: r.id, name: nameOf(r.id), score: r.total | 0 }));
  ov.closeResults();
  let p;
  try { p = await makePodium({ layer: L, engine: ctx.engine, sfx: ctx.sfx, rows, players: lp, myId }); } catch (e) { console.error(e); return; }
  if (my !== buildId || !L) { p.dispose(); return; } // left the game while the podium loaded
  podium = p;
  L.classList.add('bk-final');
  ctx.engine.setScene(podium.scene);
  teardownRound(); // the island is done: drops the animal name tags too
}

// ---- HUD data ----
const ME_COL = '#e0a400', FEED_VERB = { bonk: 'bonked', push: 'pushed', dash: 'rammed', bump: 'knocked' };
const lobbyOf = id => ctx.app.lobby && ctx.app.lobby.players.find(p => p.id === id);
const nameOf = id => { const p = lobbyOf(id), r = roster.find(x => x.id === id); return p ? p.name : r ? r.name : 'Player'; };
// Names in the feed: the one you are gets "You" / "you" in gold; the rest wear their colour.
const nm = (id, low) => `<b style="font-weight:400;color:${id === myId ? ME_COL : ctx.app.colorOf(id)}">${id === myId ? (low ? 'you' : 'You') : esc(nameOf(id))}</b>`;

function outFeed(d) {
  if (d.by && d.by !== d.id) {
    kos.set(d.by, (kos.get(d.by) || 0) + 1);
    if (d.a === 'nut') hud.feed(`${d.by === myId ? 'Your' : nm(d.by) + "'s"} coconut got ${nm(d.id, true)}!`);
    else hud.feed(`${nm(d.by)} ${FEED_VERB[d.a] || 'knocked'} ${nm(d.id, true)} into the sea!`);
    return;
  }
  const at = lastOn.get(d.id), sank = at && world.solidAt(at[0], at[1], clock) < 0;
  hud.feed(sank ? `${nm(d.id)} sank with the edge!` : `${nm(d.id)} slipped off the edge!`);
}

function outSound(d) {
  const { sfx } = ctx, p = lobbyOf(d.id), a = window.ANIMALS && window.ANIMALS[p ? p.av | 0 : 0];
  sfx.animal(a ? a.id : '');
  if (d.id === myId) { sfx.lose(); ov.big('SPLASH!<small>You can still drop coconuts</small>', 1500); }
}

// Every frame: roster, top chips, buttons.
function hudFrame() {
  const st = status();
  hud.idle(st.mode === 'none');
  hud.ghost(st.mode === 'ghost' || st.mode === 'out');
  hud.cooldown('push', st.push / (BK.CD.push + CD_PAD));
  hud.cooldown('dash', st.dash / (BK.CD.dash + CD_PAD));
  hud.cooldown('bonk', st.bonk / (BK.CD.bonk + CD_PAD));
  hud.cooldown('nut', st.nut / (BK.CD.nut + NUT_SLACK));
  hud.charge(st.charge);
  const rows = roster.map(r => ({ id: r.id, name: nameOf(r.id), color: ctx.app.colorOf(r.id), ko: kos.get(r.id) || 0, out: sunk.has(r.id) || outOrder.includes(r.id) }));
  // the edge: the next warn still to come, "cracking" while a break is in its warn window, "last stand" once all have dropped
  let next = Infinity, warn = false, left = 0;
  for (const [, , w, dr] of breaks) {
    if (clock >= dr) continue;
    left++;
    if (clock >= w) warn = true; else next = Math.min(next, w);
    if (clock >= w && !warned.has(w)) { warned.add(w); if (clock - w < 1.5) { hud.feed('The edge is cracking!', '#ffe1dd'); ctx.sfx.oops(); } }
  }
  const secs = Math.ceil(Math.max(0, next - clock)), last = !left;
  hud.top({
    rd, of: roundOf, alive: rows.filter(r => !r.out).length, total: rows.length, hot: warn,
    // the two states carry their whole text in the value: phones hide the label, and the meaning must stay
    label: last || warn ? '' : 'Edge breaks in',
    value: last ? 'Last stand!' : warn ? 'Edge is cracking!' : !Number.isFinite(next) ? '' : `${secs / 60 | 0}:${String(secs % 60).padStart(2, '0')}`,
  });
  hud.roster(rows);
}

// The body hits the water: seen falling through the surface, or the server said `out` first.
function sink(id) {
  if (sunk.has(id)) return;
  sunk.add(id);
  const F = fighters.get(id);
  if (F && F.state === 'alive') {
    fx.splash(F.x, F.z, 1);
    fx.pop(F.x, BK.WATER_Y + .8, F.z, 'SPLASH!', 34, '#bfe6ff');
    ctx.sfx.splash();
    fighters.out(id);
  }
  pend.set(id, { t: GHOST_T, ok: outOrder.includes(id) });
}

function seat(id) {
  if (!outOrder.includes(id)) outOrder.push(id);
  sunk.add(id); pend.delete(id);
  fighters.ghost(id, outOrder.indexOf(id), world.ghostCloud);
  if (id === myId) ret.x = ret.z = 0;
}

const aliveOthers = id => [...bufs.keys()].filter(o => o !== id).map(o => fighters.get(o)).filter(F => F && F.state === 'alive');

function onFx(d) {
  if (d.id === myId && (d.a === 'push' || d.a === 'bonk' || d.a === 'dash')) return; // our own: already shown when it happened
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

// Somebody hit us (the server checked it): fly. Ignored once we are falling or out.
function onKnock(d) {
  if (!me || me.falling || myMode() !== 'alive') return;
  const vx = Number.isFinite(d.vx) ? d.vx : 0, vz = Number.isFinite(d.vz) ? d.vz : 0, power = Math.hypot(vx, vz);
  const dx = power > 1e-6 ? vx / power : 0, dz = power > 1e-6 ? vz / power : 0;
  BK.applyKnock(me, dx, dz, { power, vy: Number.isFinite(d.vy) ? d.vy : 0, stun: Number.isFinite(d.stun) ? d.stun : 0 });
  cur = null; knockAt = performance.now(); away = false;
  if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(d.a === 'bonk' ? 60 : 25); } catch {}
  if (d.a === 'push') { fx.pop(me.x, 1.2, me.z, 'Push!', 22, '#bfe6ff'); fx.stars(me.x, .7, me.z, 4, .6); }
  else if (d.a === 'bonk') bonkFx(me.x, me.z, Math.max(0, Math.min(1, (power - BK.BONK.power[0]) / BK.BONK.power[1])));
  else if (d.a === 'dash' || d.a === 'bump') fx.stars(me.x, .7, me.z, 4, .6);
}

// The server refused our state (or we rejoined): take its body.
function onFix(d) {
  if (!me || me.falling || myMode() !== 'alive') return;
  if (!['x', 'z', 'y', 'vx', 'vz', 'vy'].every(k => Number.isFinite(d[k]))) return;
  Object.assign(me, { x: d.x, z: d.z, y: d.y, vx: d.vx, vz: d.vz, vy: d.vy });
  if (sync === 'any') sync = '';
  away = false;
}

// ---- own actions ----
function myMode() {
  const F = me && fighters && fighters.get(myId);
  if (!F) return 'none';
  if (F.state !== 'alive') return F.state; // 'out' | 'ghost'
  return me.falling ? 'falling' : 'alive';
}
const canAct = () => !sync && !ended && clock >= 0 && myMode() === 'alive' && me.stun <= 0 && me.lunge <= 0;

function doPush() {
  const now = performance.now();
  if (!canAct() || me.charging || now < cdUntil.push || !BK.startPush(me)) return;
  cdUntil.push = now + (BK.CD.push + CD_PAD) * 1000;
  const q = ++seq;
  sendSt(true);
  send({ t: 'act', a: 'push', q, c: 0 });
  fighters.punch(myId);
  let any = false;
  for (const o of BK.pushTargets(me, others)) {
    const [dx, dz] = BK.hitDir(me, o);
    send({ t: 'hit', id: o.id, a: 'push', q, c: 0, dx: r2(dx), dz: r2(dz) });
    fx.pop(o.x, 1.2, o.z, 'Push!', 22, '#bfe6ff'); fx.stars(o.x, .7, o.z, 4, .6);
    any = true;
  }
  if (any) fx.hitstop(60);
  ctx.sfx.beep(any ? 380 : 520, .07, 'triangle', .07, -140);
}

function bonkStart() {
  if (!canAct() || me.charging || performance.now() < cdUntil.bonk) return;
  BK.startBonk(me);
}
function bonkRelease() {
  if (!me || !me.charging) return;
  if (sync || ended || myMode() !== 'alive') { me.charging = false; me.charge = 0; return; }
  const c = BK.releaseBonk(me);
  if (c < 0) return;
  cdUntil.bonk = performance.now() + (BK.CD.bonk + CD_PAD) * 1000;
  const q = ++seq, cc = r2(c);
  sendSt(true);
  send({ t: 'act', a: 'bonk', q, c: cc });
  cur = { a: 'bonk', q, c: cc, done: new Set() };
  ctx.sfx.beep(240, .1, 'sawtooth', .05, 160);
}

function doDash() {
  const now = performance.now();
  if (!canAct() || now < cdUntil.dash || !BK.startDash(me)) return;
  cdUntil.dash = now + (BK.CD.dash + CD_PAD) * 1000;
  const q = ++seq;
  sendSt(true);
  send({ t: 'act', a: 'dash', q, c: 0 });
  cur = { a: 'dash', q, c: 0, done: new Set() };
  fx.dust(me.x, me.z, 6);
  ctx.sfx.beep(700, .1, 'sine', .05, 500);
}

function doNut() {
  const now = performance.now();
  if (myMode() !== 'ghost' || ended || ph !== 'play' || now < cdUntil.nut) return;
  cdUntil.nut = now + (BK.CD.nut + NUT_SLACK) * 1000;
  send({ t: 'nut', x: r2(ret.x), z: r2(ret.z) });
  ctx.sfx.beep(900, .12, 'sine', .05, -300);
}

function bonkFx(x, z, c) {
  const mega = c >= MEGA;
  fx.pop(x, 1.3, z, mega ? 'MEGA BONK!' : 'BONK!', 30 + c * 22, mega ? '#ff5d6c' : '#ffd23f');
  fx.stars(x, .8, z, 6 + (c * 8 | 0), 1 + c);
  fx.shake(.15 + c * .35);
  ctx.sfx.beep(170 - c * 50, .14, 'square', .1, -90);
}

// While our bonk lunges or our dash runs: every body it reaches on this screen is hit, once.
function strike() {
  if (!cur) return;
  const bonk = cur.a === 'bonk';
  if (bonk ? !(me.lunge > 0) : !(me.dash > 0)) { cur = null; return; }
  let fresh = false;
  for (const o of others) {
    if (cur.done.has(o.id)) continue;
    if (bonk ? !BK.bonkTouch(me, o) : Math.hypot(o.x - me.x, o.z - me.z) > DASH_HIT) continue;
    cur.done.add(o.id);
    const [dx, dz] = BK.hitDir(me, o);
    if (!fresh) { sendSt(true); fresh = true; } // the server measures reach from our last st
    send({ t: 'hit', id: o.id, a: cur.a, q: cur.q, c: cur.c, dx: r2(dx), dz: r2(dz) });
    if (bonk) {
      me.lunge = Math.min(me.lunge, BK.BONK.hitLungeT); me.vx *= BK.BONK.hitSlow; me.vz *= BK.BONK.hitSlow; // no lunging on into the sea
      bonkFx(o.x, o.z, cur.c);
    } else { fx.stars((me.x + o.x) / 2, .7, (me.z + o.z) / 2, 5, .7); fx.shake(.12); }
    fx.hitstop(60);
  }
}

const groundAt = (x, z) => world.solidAt(x, z, clock);
const flOf = b => (b.charging ? FL.CHARGE : 0) | (b.stun > 0 ? FL.STUN : 0) | (b.lunge > 0 ? FL.LUNGE : 0) | (b.dash > 0 ? FL.DASH : 0)
  | (b.y > 0 || b.vy > 0 ? FL.AIR : 0) | (b.falling ? FL.FALL : 0);

function stepMe(dt) {
  if (dt <= 0) return;
  const [mx, mz] = !ended && clock >= 0 && !me.falling ? inputVec() : [0, 0]; // nobody moves in the countdown
  const ev = BK.step(me, { mx, mz }, dt, groundAt);
  me.f = wrap(me.f); // st values must stay small (the server drops |v| >= 100)
  if (!me.falling) {
    BK.hitObstacles(me, world.obstacles(clock));
    BK.separate(me, others);
    strike();
  }
  if ((ev === 'fall' || me.falling) && !fellSent) {
    fellSent = true; cur = null; me.charging = false; me.charge = 0;
    send({ t: 'fall' });
    ctx.sfx.beep(760, .35, 'sine', .05, -520);
  }
}

// force: right now, whatever the cadence. The server checks an act against our last st (stun) and a hit's reach
// from it, so each act and each frame's hits go out right behind a fresh st.
function sendSt(force) {
  if (ended || me.falling) return;
  const now = performance.now();
  if (!force && now < nextStAt) return;
  nextStAt = force ? now + ST_MS : Math.max(nextStAt + ST_MS, now + ST_MS / 2); // keeps the 20 Hz phase; after a pause (hidden tab) no catching up
  send({ t: 'st', x: r2(me.x), z: r2(me.z), y: r2(me.y), vx: r2(me.vx), vz: r2(me.vz), vy: r2(me.vy), f: r2(me.f), fl: flOf(me), ch: me.charging ? r2(me.charge) : 0 });
}

// ---- frame ----
// Landing dust and the dash trail, for any body.
function bodyDust(id, x, z, y, fl) {
  const air = y > .02 || !!(fl & FL.AIR);
  if (airborne.get(id) && !air && !(fl & FL.FALL)) fx.dust(x, z, 3);
  airborne.set(id, air);
  if ((fl & FL.DASH) && Math.random() < .5) fx.dust(x, z, 1);
}

// A bonk seen on this screen: the first time the lunging body's fist reaches someone, show the hit.
function stepWatches(dt) {
  for (let i = watches.length - 1; i >= 0; i--) {
    const w = watches[i], A = fighters.get(w.id);
    w.t -= dt;
    if (w.t <= 0 || !A || A.state !== 'alive') { watches.splice(i, 1); continue; }
    const att = { x: A.x, z: A.z, f: A.f, lunge: 1 }, c = w.c;
    for (const o of aliveOthers(w.id)) {
      if (w.hit.has(o.id) || !BK.bonkTouch(att, o)) continue;
      w.hit.add(o.id);
      bonkFx(o.x, o.z, c);
    }
  }
}

function frame(dt, t) {
  if (podium) { podium.tick(dt, t); return; }
  if (!world) return;
  const cam = ctx.engine.camera;
  clock = Math.min(clock + dt, lastC + AHEAD);
  const ddt = fx.frozen ? 0 : dt; // hitstop freezes the bodies
  for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { const { fn } = later[i]; later.splice(i, 1); fn(); }
  world.update(dt, t, clock);
  // others, from the snapshots
  const rt = clock - DELAY;
  let ax = 0, az = 0, an = 0;
  others = [];
  for (const [id, b] of bufs) {
    const F = fighters.get(id); if (!F) continue;
    if (F.state !== 'alive') { fighters.set(id, null, ddt, t); continue; }
    const s = BK.interp(b, rt); if (!s) continue;
    const [x, z, y, f, fl, ch] = s;
    fighters.set(id, { x, z, y, f, fl, ch, ground: world.solidAt(x, z) >= 0 }, ddt, t);
    if ((fl & FL.FALL) && y < BK.WATER_Y + .05) { sink(id); continue; }
    if (!(fl & FL.FALL)) { ax += x; az += z; an++; others.push({ id, x, z, y, f }); if (y < .05) lastOn.set(id, [x, z]); }
    bodyDust(id, x, z, y, fl);
  }
  // our own animal, simulated here (held still until the server's word after a new round or a hidden tab, and once
  // the round has ended: whoever the server called the winner does not slide into the sea afterwards)
  const mine = me && fighters.get(myId);
  if (mine && mine.state === 'alive') {
    if (!sync && !ended) stepMe(ddt);
    const fl = flOf(me);
    fighters.set(myId, { x: me.x, z: me.z, y: me.y, f: me.f, fl, ch: me.charging ? me.charge : 0, ground: groundAt(me.x, me.z) >= 0 }, ddt, t);
    if (me.falling && me.y < BK.WATER_Y + .05) sink(myId);
    else {
      if (!me.falling) { ax += me.x; az += me.z; an++; if (me.y < .05) lastOn.set(myId, [me.x, me.z]); }
      bodyDust(myId, me.x, me.z, me.y, fl);
      if (!sync) sendSt(false);
    }
  } else if (mine) fighters.set(myId, null, ddt, t);
  for (const [id, p] of pend) if ((p.t -= dt) <= 0 && p.ok) seat(id);
  stepWatches(dt);
  hudFrame();
  ov.count(clock);
  // ghost: aim the reticle (NUT.aim m/s, inside the island) and drop coconuts on it
  reticle.visible = myMode() === 'ghost' && !ended;
  if (reticle.visible) {
    const [mx, mz] = inputVec(), R = world.radius(clock);
    ret.x += mx * BK.NUT.aim * dt; ret.z += mz * BK.NUT.aim * dt;
    const d = Math.hypot(ret.x, ret.z); if (d > R) { ret.x *= R / d; ret.z *= R / d; }
    reticle.position.set(ret.x, .05, ret.z); reticle.rotation.y += dt;
    reticle.userData.mat.opacity = performance.now() < cdUntil.nut ? .4 : .95;
  }
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
