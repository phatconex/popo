// Bot match for Hide & Seek over the real network.
//   Full match:   HS_HIDE_T=2 HS_ROUND_T=20 PORT=3100 node server/index.js  &&  node test/bot-match.js 3100
//   Blind Drive:  BD_FAST=1 PORT=3101 node server/index.js  &&  node test/bot-match.js --drive 3101 4   (N = 3 or 4 bots)
//   Fill a lobby: node test/bot-match.js --lobby ABCD 3000 11   (11 bots join room ABCD and idle; Ctrl+C to stop)
//   Bot-hosted:   node test/bot-match.js --host 3000 1 [map]    (a bot opens a room and starts when you press Ready)
const WebSocket = require('ws');
const args = process.argv.slice(2);

function bot(port, name, av) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const b = { ws, name, av, msgs: [], handlers: [], send: o => ws.readyState === 1 && ws.send(JSON.stringify(o)) };
  ws.on('message', buf => { const m = JSON.parse(buf); b.msgs.push(m); for (const h of b.handlers) h(m); });
  b.on = fn => b.handlers.push(fn);
  b.open = new Promise(r => ws.on('open', r));
  return b;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = (b, pred, ms = 30000) => new Promise((res, rej) => {
  const hit = b.msgs.find(pred); if (hit) return res(hit);
  const t = setTimeout(() => rej(new Error(`${b.name}: timeout`)), ms);
  b.on(m => { if (pred(m)) { clearTimeout(t); res(m); } });
});

async function lobbyOnly(code, port, n) {
  for (let i = 0; i < n; i++) {
    const b = bot(port, 'Bot ' + (i + 1), (i * 5) % 24); await b.open;
    b.send({ t: 'join', name: b.name, av: b.av, code });
    if (i % 2) setTimeout(() => b.send({ t: 'profile', ready: true }), 500);
  }
  console.log(`${n} bots joined ${code}. Ctrl+C to stop.`);
}

async function match(port) {
  const bots = [];
  for (let i = 0; i < 4; i++) { const b = bot(port, 'Bot' + i, i * 3); await b.open; bots.push(b); }
  const [host] = bots;
  host.send({ t: 'join', name: host.name, av: host.av, game: 'hideseek' });
  const code = (await until(host, m => m.t === 'joined')).code;
  for (const b of bots.slice(1)) { b.send({ t: 'join', name: b.name, av: b.av, code }); await until(b, m => m.t === 'joined'); }
  host.send({ t: 'settings', settings: { rounds: '2', map: 'farm' } });
  await wait(200);
  host.send({ t: 'start' });

  let rounds = 0, mateLeak = false, shots = 0, hits = 0;
  for (const b of bots) {
    b.state = {};
    b.on(m => {
      if (m.t !== 'g') return;
      const d = m.d;
      if (d.t === 'init') b.state.role = d.role;
      if (d.t === 's') { b.state.s = d; if (d.me.role === 'seeker' && d.me.alive && d.mates) mateLeak = true; }
      if (d.t === 'round' && b === host) rounds++;
      if (d.t === 'fx' && d.kind === 'shot' && b === host) { shots++; if (d.hit) hits++; }
    });
    b.timer = setInterval(() => {
      const s = b.state.s; if (!s) return;
      b.send({ t: 'g', d: { t: 'in', mx: Math.random() * 2 - 1, my: Math.random() * 2 - 1, run: Math.random() < .2 } });
      if (s.me.role === 'seeker' && s.ph === 'playing' && s.e.length) {
        const me = s.k.find(k => k[0] === b.id) || s.k[0];
        const near = s.e.map(e => [e, Math.hypot(e[1] - me[2], e[2] - me[3])]).sort((x, y) => x[1] - y[1])[0][0];
        b.send({ t: 'g', d: { t: 'shoot', x: near[1], y: near[2] } });
      }
    }, 700);
  }
  for (const b of bots) b.id = b.msgs.find(m => m.t === 'joined').id;

  // rejoin test: bot 3 drops mid round and comes back
  await until(bots[3], m => m.t === 'g' && m.d.t === 's' && m.d.ph === 'playing', 30000);
  const sess = bots[3].msgs.find(m => m.t === 'joined');
  bots[3].ws.close(); clearInterval(bots[3].timer);
  await wait(800);
  const back = bot(port, 'Bot3b', 9); await back.open;
  back.send({ t: 'rejoin', code: sess.code, token: sess.token });
  await until(back, m => m.t === 'g' && m.d.t === 'init', 5000);
  console.log('rejoin ok');

  const final = await until(host, m => m.t === 'lobby' && m.state === 'lobby' && rounds >= 2, 120000);
  for (const b of bots) clearInterval(b.timer);
  if (mateLeak) throw new Error('seeker received mates');
  console.log(`rounds ${rounds}, shots ${shots}, hits ${hits}, wins ${final.players.map(p => p.wins).join(',')}`);
  console.log('OK');
  process.exit(0);
}

// Bots that join an existing room and play (wander; shoot when seeker): node test/bot-match.js --join ABCD 3000 3
async function joinPlay(code, port, n) {
  for (let i = 0; i < n; i++) {
    const b = bot(port, 'Bot ' + (i + 1), (i * 7 + 3) % 24); await b.open;
    b.send({ t: 'join', name: b.name, av: b.av, code });
    b.send({ t: 'profile', ready: true });
    wander(b);
  }
  console.log(`${n} bots playing in ${code}. Ctrl+C to stop.`);
}

// A bot hosts a Hide & Seek room (Time = 2 min) and starts each match once every human in it is Ready;
// n - 1 more bots join and play: node test/bot-match.js --host 3000 1 [map]
async function hostPlay(port, n, map = 'random') {
  const host = bot(port, 'Bot 1', 3); await host.open;
  host.send({ t: 'join', name: host.name, av: host.av, game: 'hideseek' });
  const code = (await until(host, m => m.t === 'joined')).code;
  host.send({ t: 'settings', settings: { map, rounds: 'auto', time: '120' } });
  host.send({ t: 'profile', ready: true });
  const botIds = new Set([host.msgs.find(m => m.t === 'joined').id]);
  wander(host);
  for (let i = 1; i < n; i++) {
    const b = bot(port, 'Bot ' + (i + 1), (i * 7 + 3) % 24); await b.open;
    b.send({ t: 'join', name: b.name, av: b.av, code });
    botIds.add((await until(b, m => m.t === 'joined')).id);
    b.send({ t: 'profile', ready: true });
    wander(b);
  }
  host.on(m => {
    if (m.t !== 'lobby' || m.state !== 'lobby') return;
    const humans = m.players.filter(p => !botIds.has(p.id) && p.on !== false);
    if (humans.length && humans.every(p => p.ready)) setTimeout(() => host.send({ t: 'start' }), 800);
  });
  console.log(`room ${code}: http://localhost:${port}/?room=${code}  (press Ready to start; Ctrl+C to stop)`);
}

// Play loop shared by joinPlay / hostPlay: wander around, and shoot at the nearest animal now and then when seeker.
function wander(b) {
    let s = null, id = (b.msgs.find(m => m.t === 'joined') || {}).id || 0, dir = [0, 0];
    b.on(m => { if (m.t === 'lobby' && m.state === 'lobby' && id && m.players.some(p => p.id === id && !p.ready)) b.send({ t: 'profile', ready: true }); });
    b.on(m => { if (m.t === 'joined') id = m.id; if (m.t === 'g' && m.d.t === 's') s = m.d; });
    setInterval(() => {
      if (!s) return;
      if (Math.random() < .3) dir = Math.random() < .3 ? [0, 0] : [Math.random() * 2 - 1, Math.random() * 2 - 1];
      b.send({ t: 'g', d: { t: 'in', mx: dir[0], my: dir[1], run: false } });
      if (s.me.role === 'hider' && s.me.alive && s.ph === 'playing' && !s.me.cd.say && Math.random() < .1) b.send({ t: 'g', d: { t: 'say' } }); // call now and then
      if (s.me.role === 'seeker' && s.ph === 'playing' && s.e.length && Math.random() < .08) {
        const me = s.k.find(k => k[0] === id); if (!me) return;
        const near = s.e.map(e => [e, Math.hypot(e[1] - me[2], e[2] - me[3])]).sort((x, y) => x[1] - y[1])[0][0];
        b.send({ t: 'g', d: { t: 'shoot', x: near[1], y: near[2] } });
      }
    }, 600);
}

// Blind Drive full match: N bots (3 or 4) in teams, 2 levels. Drivers steer along the track, navigators send signals.
async function drive(port, n) {
  const BD = require('../public/games/blinddrive3d/shared.js');
  const teamOf = n === 4 ? [0, 0, 1, 1] : [0, 0, 0];
  const bots = [];
  for (let i = 0; i < n; i++) { const b = bot(port, 'Drv' + i, i * 3); await b.open; bots.push(b); }
  const [host] = bots;
  host.send({ t: 'join', name: host.name, av: host.av });
  const code = (await until(host, m => m.t === 'joined')).code;
  for (const b of bots.slice(1)) { b.send({ t: 'join', name: b.name, av: b.av, code }); await until(b, m => m.t === 'joined'); }
  for (const b of bots) b.id = b.msgs.find(m => m.t === 'joined').id;
  // switching game clears teams, so switch first and pick teams afterwards
  host.send({ t: 'settings', game: 'blinddrive', settings: { levels: 2 } });
  await until(host, m => m.t === 'lobby' && m.game === 'blinddrive' && m.settings && m.settings.levels === 2);
  bots.forEach((b, i) => b.send({ t: 'profile', team: teamOf[i] }));
  await until(host, m => m.t === 'lobby' && m.players.length === n && m.players.every(p => p.team >= 0 && p.team === teamOf[bots.findIndex(b => b.id === p.id)]));
  host.send({ t: 'start' });

  for (const b of bots) {
    const st = b.st = { role: 'nav', team: -1, track: null, car: null, got: new Set(), level: 0 };
    b.on(w => {
      if (w.t !== 'g') return;
      const m = w.d;
      if (m.t === 'roles') st.role = m.me.role;
      if (m.t === 'init') {
        st.role = m.me.role; st.team = m.me.team; st.track = m.track; st.level = m.level; st.got = new Set(m.teams.find(t => t.id === m.me.team)?.got || []);
        const sp = m.start.find(s => s[0] === m.me.team) || m.start[0];
        st.car = { x: sp[1], z: sp[2], a: sp[3], v: 0, lat: 0 };
        st.ring = m.track.stops.map(s => BD.stopPoints(m.track, s).ring);
        st.ph = m.ph;
      }
      if (m.t === 'fix' && st.car) { st.car.x = m.x; st.car.z = m.z; st.car.a = m.a; st.car.v = m.v; st.car.lat = 0; }
      if (m.t === 'fx' && m.kind === 'pick' && m.team === st.team) st.got.add(m.i);
      if (m.t === 's') st.ph = m.ph;
    });
    const DT = .05;
    b.timer = setInterval(() => {
      if (!st.track || !st.car || st.ph !== 'race') return;
      if (st.role === 'nav') return;
      const tr = st.track, c = st.car, pts = tr.pts;
      const near = BD.nearestOnTrack(tr, c.x, c.z);
      // target: 3 points ahead; inside a stop ring when one is close and not yet picked
      let tx, tz, hold = false;
      const ti = Math.min(pts.length - 1, near.i + 3);
      tx = pts[ti][0]; tz = pts[ti][1];
      for (let k = 0; k < tr.stops.length; k++) {
        const s = tr.stops[k];
        if (st.got.has(k) || near.i > s.i + 2 || s.i - near.i > 5) continue;
        const r = st.ring[k];
        tx = r.x; tz = r.z;
        if (Math.hypot(r.x - c.x, r.z - c.z) < 4) hold = true;
        break;
      }
      const dx = tx - c.x, dz = tz - c.z, len = Math.hypot(dx, dz) || 1;
      const right = (-Math.cos(c.a) * dx + Math.sin(c.a) * dz) / len; // positive: target on the right, positive steer turns right
      const fwd = (Math.sin(c.a) * dx + Math.cos(c.a) * dz) / len;
      let steer = Math.max(-1, Math.min(1, right * 3 + (fwd < 0 ? Math.sign(right || 1) : 0)));
      const dRing = Math.hypot(dx, dz);
      let gas = 1, brake = 0;
      if (hold) {
        // approach slowly, then stop inside the ring
        const vt = Math.min(3, dRing * .8);
        if (dRing < 1.4 || c.v > vt) { gas = 0; brake = 1; }
      } else if (c.v > 5.5 || Math.abs(right) > .5 && c.v > 3.5) { gas = 0; }
      const env = BD.envAt(tr, c.x, c.z, c.a);
      BD.stepCar(c, { gas, brake, steer }, env, DT);
      b.send({ t: 'g', d: { t: 'car', x: c.x, z: c.z, a: c.a, v: c.v, st: steer, g: gas, b: brake, r: 0 } });
    }, 50);
    b.sigTimer = setInterval(() => {
      if (st.role === 'nav' && st.ph !== 'result') b.send({ t: 'g', d: { t: 'sig', k: Math.floor(Math.random() * 8) } });
    }, 1500);
  }

  const levelMs = 90000;
  for (let L = 1; L <= 2; L++) {
    const lm = await until(host, m => m.t === 'g' && m.d.t === 'level' && m.d.level === L, levelMs + (L === 1 ? 20000 : 0));
    for (const r of lm.d.rows) console.log(`level ${L} team ${r.team}: place ${r.place}, passengers ${r.picked}, coins ${r.coins}, points ${r.points}`);
  }
  for (const b of bots) await until(b, m => m.t === 'g' && m.d.t === 'final', 30000);
  await until(host, m => m.t === 'lobby' && m.state === 'lobby' && m.game === 'blinddrive' && host.msgs.indexOf(m) > host.msgs.findIndex(x => x.t === 'g' && x.d.t === 'final'), 30000);
  for (const b of bots) { clearInterval(b.timer); clearInterval(b.sigTimer); }
  const fin = host.msgs.find(m => m.t === 'g' && m.d.t === 'final').d;
  console.log('final: ' + fin.rows.map(r => `team ${r.team} rank ${r.rank} total ${r.total}`).join('; '));
  console.log('OK');
  process.exit(0);
}

if (args[0] === '--drive') drive(+args[1] || 3101, +args[2] || 4).catch(e => { console.error('FAIL', e.message); process.exit(1); });
else if (args[0] === '--host') hostPlay(+args[1] || 3000, +args[2] || 1, args[3]);
else if (args[0] === '--join') joinPlay(args[1], +args[2] || 3000, +args[3] || 3);
else if (args[0] === '--lobby') lobbyOnly(args[1], +args[2] || 3000, +args[3] || 11);
else match(+args[0] || 3100).catch(e => { console.error('FAIL', e.message); process.exit(1); });
