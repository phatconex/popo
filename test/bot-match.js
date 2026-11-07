// Bot match for Hide & Seek over the real network.
//   Full match:   HS_HIDE_T=2 HS_ROUND_T=20 PORT=3100 node server/index.js  &&  node test/bot-match.js 3100
//   Fill a lobby: node test/bot-match.js --lobby ABCD 3000 11   (11 bots join room ABCD and idle; Ctrl+C to stop)
//   Bot-hosted:   node test/bot-match.js --host 3000 1 [map]    (a bot opens a room and starts when you press Ready)
//   Bonk Island:  BK_FAST=1 PORT=3101 node server/index.js  &&  node test/bot-match.js --bonk 3101 4   (3 rounds, prints places, OK)
//                 (add NET_LAG_MS=250 to the server to check play under latency)
//   Bonk join:    node test/bot-match.js --bonk-join ABCD 3000 3   (bots join a human's room and play until Ctrl+C)
//   Bonk host:    node test/bot-match.js --bonk-host 3000 3 [map] [rounds]   (bots open a room; it starts when you press Ready)
const WebSocket = require('ws');
const BK = require('../public/games/bonk3d/shared.js');
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

// ---------------------------------------------------------------------------------------------------------
// Bonk Island bots. Each bot simulates its own body with BK.step (as the real client does), sends st at 20 Hz,
// fights with act + hit, reports falls, applies knock / fix from the server, and throws coconuts as a ghost.
// AI follows the approved mockup (botThink): chase the nearest, wander, avoid edges, push / bonk up close, rare dash.
const rnd = (a, b) => a + Math.random() * (b - a);
function bonkBot(b, id) {
  const S = { id, rd: 0, round: null, tiles: null, brk: new Map(), obst: [], body: null, snap: null, clk: { c: -9, at: Date.now() },
    ghost: false, q: 0, fellSent: false, cdUntil: { push: 0, bonk: 0, dash: 0 }, ai: { mx: 0, mz: 0, t: 0, target: null, chargeUntil: 0 },
    cur: null, hitSet: new Set(), nutAt: Date.now() + rnd(4000, 7000), stats: { push: 0, bonk: 0, dash: 0, hits: 0, falls: 0, nuts: 0 } };
  const clock = () => S.clk.c + (Date.now() - S.clk.at) / 1000;
  const key = (q, r) => q + ',' + r;
  const ground = (x, z) => { // -1 or surface 0/1/2 at the bot's round clock
    const [q, r] = BK.xzToHex(x, z), k = key(q, r), sf = S.tiles.get(k);
    if (sf === undefined) return -1;
    const br = S.brk.get(k);
    return br && BK.tileState(br, clock()) === 'drop' ? -1 : sf;
  };
  const safeAt = (x, z) => { // standing here is fine now and for a moment (not cracking)
    const [q, r] = BK.xzToHex(x, z), k = key(q, r);
    if (!S.tiles.has(k)) return false;
    const br = S.brk.get(k);
    return !br || BK.tileState(br, clock() + .4) === 'ok';
  };
  const centres = () => S.obst.filter(([q, r]) => { const br = S.brk.get(key(q, r)); return !br || BK.tileState(br, clock()) !== 'drop'; }).map(([q, r]) => BK.hexToXZ(q, r));
  const others = () => (S.snap ? S.snap.p : []).filter(r => r[0] !== id && !r[7] && !(r[5] & 32) && r[3] > -.3).map(r => ({ id: r[0], x: r[1], z: r[2], y: r[3], f: r[4] }));
  const tx = o => ({ rd: S.rd, ...o });
  const send = d => b.send({ t: 'g', d: tx(d) });

  b.on(m => {
    if (m.t === 'joined') S.id = id = m.id;
    if (m.t !== 'g') return;
    const d = m.d;
    if (d.t === 'round') {
      S.rd = d.rd; S.round = d;
      S.tiles = new Map();
      for (let q = -d.rings; q <= d.rings; q++) for (let r = -d.rings; r <= d.rings; r++) if (BK.ring(q, r) <= d.rings) S.tiles.set(key(q, r), 0);
      for (const [q, r, sf] of d.surf) S.tiles.set(key(q, r), sf);
      S.brk = new Map(d.breaks.map(x => [key(x[0], x[1]), x]));
      S.obst = d.obst; S.clk = { c: d.c, at: Date.now() };
      const sp = d.spawn[S.id]; if (sp) S.body = BK.newBody(sp[0], sp[1], sp[2]);
      S.ghost = false; S.fellSent = false; S.cur = null; S.hitSet = new Set(); S.snap = null;
      S.cdUntil = { push: 0, bonk: 0, dash: 0 }; S.ai = { mx: 0, mz: 0, t: 0, target: null, chargeUntil: 0 };
    } else if (d.t === 's' && d.rd === S.rd) {
      S.snap = d; S.clk = { c: d.c, at: Date.now() };
    } else if (d.t === 'knock' && d.rd === S.rd && S.body && !S.ghost) {
      const pw = Math.hypot(d.vx, d.vz) || 1;
      BK.applyKnock(S.body, d.vx / pw, d.vz / pw, { power: pw, vy: d.vy, stun: d.stun });
      S.ai.chargeUntil = 0; S.cur = null;
    } else if (d.t === 'fix' && d.rd === S.rd && S.body) {
      Object.assign(S.body, { x: d.x, z: d.z, y: d.y, vx: d.vx, vz: d.vz, vy: d.vy });
    } else if (d.t === 'out' && d.rd === S.rd && d.id === S.id) {
      S.ghost = true; if (S.body) S.body.falling = true;
    }
  });

  // chase / wander / edge avoidance, mockup botThink
  function think(f, dt) {
    const ai = S.ai, now = Date.now();
    const sp = Math.hypot(f.vx, f.vz), cd0 = Math.hypot(f.x, f.z) || 1;
    if (sp > .4 && f.stun <= 0 && f.lunge <= 0 && f.dash <= 0 && !safeAt(f.x + f.vx / sp * 1.2, f.z + f.vz / sp * 1.2)) { ai.mx = -f.x / cd0; ai.mz = -f.z / cd0; ai.t = Math.max(ai.t, .35); }
    ai.t -= dt; if (ai.t > 0) return;
    ai.t = rnd(.3, .65);
    const os = others();
    if (!os.length) { ai.mx = ai.mz = 0; return; }
    if (!ai.target || !os.some(o => o.id === ai.target) || Math.random() < .07) {
      os.sort((p, q) => Math.hypot(p.x - f.x, p.z - f.z) - Math.hypot(q.x - f.x, q.z - f.z));
      ai.target = os[Math.random() < .7 ? 0 : Math.random() * os.length | 0].id;
    }
    if (Math.random() < .2) { // wander for a moment
      const a = Math.random() * 2 * Math.PI, r = Math.random() * 2.5, wx = Math.cos(a) * r - f.x, wz = Math.sin(a) * r - f.z, wn = Math.hypot(wx, wz) || 1;
      ai.mx = wx / wn; ai.mz = wz / wn; ai.t = rnd(.6, 1.2); return;
    }
    const tg = os.find(o => o.id === ai.target); let dx = tg.x - f.x, dz = tg.z - f.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const w = Math.sin(now / 1000 * 1.3 + id) * .35;
    let mx = dx - dz * w, mz = dz + dx * w;
    const cd = Math.hypot(f.x, f.z) || 1;
    if (!safeAt(f.x + mx * 1.3, f.z + mz * 1.3) || !safeAt(f.x, f.z)) { mx = -f.x / cd; mz = -f.z / cd; }
    const n = Math.hypot(mx, mz) || 1; ai.mx = mx / n; ai.mz = mz / n;
    if (S.cur || f.charging || f.stun > 0 || f.lunge > 0 || f.dash > 0 || clock() < 0) return;
    if (d < 1.3) {
      const r = Math.random();
      if (r < .3 && now >= S.cdUntil.push) { f.f = Math.atan2(dx, dz); doPush(f); }
      else if (r < .55 && now >= S.cdUntil.bonk && safeAt(f.x + dx * 2.3, f.z + dz * 2.3)) { f.f = Math.atan2(dx, dz); if (BK.startBonk(f)) ai.chargeUntil = now + rnd(350, 1050); }
      else if (r < .8) { ai.mx = -dz; ai.mz = dx; }
      else { ai.mx = -dx; ai.mz = -dz; ai.t = .5; }
    } else if (d > 2.2 && d < 4.5 && now >= S.cdUntil.dash && Math.random() < .06 && safeAt(f.x + dx * 2.5, f.z + dz * 2.5)) { f.f = Math.atan2(dx, dz); doDash(f); }
  }
  function doPush(f) {
    if (!BK.startPush(f)) return;
    S.cdUntil.push = Date.now() + BK.CD.push * 1000 + 80; S.stats.push++;
    const q = ++S.q; send({ t: 'act', a: 'push', q, c: 0 });
    for (const o of BK.pushTargets(f, others())) { const [dx, dz] = BK.hitDir(f, o); send({ t: 'hit', id: o.id, a: 'push', q, c: 0, dx, dz }); S.stats.hits++; }
  }
  function doDash(f) {
    if (!BK.startDash(f)) return;
    S.cdUntil.dash = Date.now() + BK.CD.dash * 1000 + 80; S.stats.dash++;
    const q = ++S.q; S.cur = { a: 'dash', q, c: 0, done: new Set() }; send({ t: 'act', a: 'dash', q, c: 0 });
  }
  function doBonk(f) {
    const c = BK.releaseBonk(f); if (c < 0) return;
    S.cdUntil.bonk = Date.now() + BK.CD.bonk * 1000 + 80; S.stats.bonk++;
    const q = ++S.q; S.cur = { a: 'bonk', q, c, done: new Set() }; send({ t: 'act', a: 'bonk', q, c });
  }
  // while lunging / dashing: report every body we touch once
  function strike(f) {
    const cur = S.cur; if (!cur) return;
    if (cur.a === 'bonk' && !(f.lunge > 0)) { S.cur = null; return; }
    if (cur.a === 'dash' && !(f.dash > 0)) { S.cur = null; return; }
    for (const o of others()) {
      if (cur.done.has(o.id)) continue;
      if (cur.a === 'bonk' ? !BK.bonkTouch(f, o) : Math.hypot(o.x - f.x, o.z - f.z) > .8) continue;
      cur.done.add(o.id); S.stats.hits++;
      const [dx, dz] = cur.a === 'bonk' ? BK.hitDir(f, o) : [Math.sin(f.f), Math.cos(f.f)];
      send({ t: 'hit', id: o.id, a: cur.a, q: cur.q, c: cur.c, dx, dz });
      if (cur.a === 'bonk') { f.lunge = Math.min(f.lunge, BK.BONK.hitLungeT); f.vx *= BK.BONK.hitSlow; f.vz *= BK.BONK.hitSlow; }
    }
  }

  setInterval(() => {
    const sn = S.snap, f = S.body;
    if (!S.round || !f || !sn) return;
    const dt = .05, now = Date.now();
    if (sn.ph !== 'count' && sn.ph !== 'play') return;
    if (S.ghost) { // ghost: throw a coconut at a random living body every 4-7 s
      if (now >= S.nutAt && sn.ph === 'play') {
        const os = others();
        if (os.length) { const t = os[Math.random() * os.length | 0]; send({ t: 'nut', x: t.x, z: t.z }); S.stats.nuts++; }
        S.nutAt = now + rnd(4000, 7000);
      }
      return;
    }
    if (f.falling) { BK.step(f, { mx: 0, mz: 0 }, dt, ground); return; }
    if (sn.ph === 'play') think(f, dt); else S.ai.mx = S.ai.mz = 0;
    if (f.charging && (now >= S.ai.chargeUntil || f.stun > 0)) { if (f.stun > 0) { f.charging = false; f.charge = 0; } else doBonk(f); }
    strike(f);
    const ev = BK.step(f, S.ai, dt, ground);
    BK.hitObstacles(f, centres());
    BK.separate(f, others());
    strike(f);
    if (ev === 'fall' || f.falling) { if (!S.fellSent) { S.fellSent = true; S.stats.falls++; send({ t: 'fall' }); } return; }
    const fl = (f.charging ? 1 : 0) | (f.stun > 0 ? 2 : 0) | (f.lunge > 0 ? 4 : 0) | (f.dash > 0 ? 8 : 0) | (f.y > 0 || f.vy > 0 ? 16 : 0);
    send({ t: 'st', x: f.x, z: f.z, y: f.y, vx: f.vx, vz: f.vz, vy: f.vy, f: f.f, fl, ch: f.charging ? f.charge : 0 });
  }, 50);
  return S;
}

// 3-round match over the real network: a bot hosts, everybody readies, the host starts. Exits 0 with OK after the final and the lobby.
async function bonkMatch(port, n) {
  n = Math.max(2, Math.min(6, n | 0 || 4));
  const bots = [];
  for (let i = 0; i < n; i++) { const b = bot(port, 'Bot' + (i + 1), (i * 5 + 1) % 24); await b.open; bots.push(b); }
  const [host] = bots;
  host.send({ t: 'join', name: host.name, av: host.av, game: 'bonk' });
  const code = (await until(host, m => m.t === 'joined')).code;
  for (const b of bots.slice(1)) { b.send({ t: 'join', name: b.name, av: b.av, code }); await until(b, m => m.t === 'joined'); }
  host.send({ t: 'settings', game: 'bonk', settings: { rounds: '3' } });
  await until(host, m => m.t === 'lobby' && m.game === 'bonk' && m.settings.rounds === '3');
  for (const b of bots) b.send({ t: 'profile', ready: true });
  await until(host, m => m.t === 'lobby' && m.players.length === n && m.players.every(p => p.ready));
  const sims = bots.map(b => bonkBot(b, b.msgs.find(m => m.t === 'joined').id));
  const names = new Map(bots.map(b => [b.msgs.find(m => m.t === 'joined').id, b.name]));
  let finalMsg = null, rounds = 0;
  host.on(m => {
    if (m.t !== 'g') return;
    if (m.d.t === 'roundEnd') {
      rounds++;
      console.log(`round ${m.d.rd}/3: ` + m.d.rows.map(r => `${r.place}.${names.get(r.id)}(ko ${r.ko}, +${r.got}, ${r.total})`).join('  '));
    } else if (m.d.t === 'final') finalMsg = m.d;
  });
  host.send({ t: 'start' });
  await until(host, m => m.t === 'g' && m.d.t === 'final', 120000);
  const at = host.msgs.length; // only a lobby message that arrives after the final counts as "back in the lobby"
  const back = await until({ name: host.name, msgs: [], on: fn => host.on(m => host.msgs.length > at && fn(m)) }, m => m.t === 'lobby' && m.state === 'lobby', 60000);
  if (rounds !== 3) throw new Error(`expected 3 rounds, got ${rounds}`);
  console.log('final: ' + finalMsg.rows.map(r => `#${r.rank} ${names.get(r.id)} ${r.total}`).join('  '));
  console.log('actions: ' + sims.map((s, i) => `${bots[i].name} p${s.stats.push} b${s.stats.bonk} d${s.stats.dash} hit${s.stats.hits} fall${s.stats.falls} nut${s.stats.nuts}`).join(' | '));
  console.log(`back in lobby (${back.players.length} players)`);
  console.log('OK');
  process.exit(0);
}

// Bots that join a human's Bonk Island room, ready up every time the lobby returns, and play: node test/bot-match.js --bonk-join ABCD 3000 3
async function bonkJoin(code, port, n) {
  for (let i = 0; i < n; i++) {
    const b = bot(port, 'Bot ' + (i + 1), (i * 7 + 3) % 24); await b.open;
    b.send({ t: 'join', name: b.name, av: b.av, code });
    const id = (await until(b, m => m.t === 'joined')).id;
    b.send({ t: 'profile', ready: true });
    b.on(m => { if (m.t === 'lobby' && m.state === 'lobby' && m.players.some(p => p.id === id && !p.ready)) b.send({ t: 'profile', ready: true }); });
    bonkBot(b, id);
  }
  console.log(`${n} bots playing Bonk Island in ${code}. Ctrl+C to stop.`);
}

// A bot opens a Bonk Island room and starts each match once every human in it is Ready:
//   node test/bot-match.js --bonk-host 3000 3 [map] [rounds]
async function bonkHost(port, n, map = 'random', rounds = '3') {
  const bots = [];
  for (let i = 0; i < n; i++) {
    const b = bot(port, 'Bot ' + (i + 1), (i * 7 + 3) % 24); await b.open;
    if (i === 0) b.send({ t: 'join', name: b.name, av: b.av, game: 'bonk' });
    else b.send({ t: 'join', name: b.name, av: b.av, code: bots[0].code });
    const j = await until(b, m => m.t === 'joined');
    b.id = j.id; b.code = j.code;
    if (i === 0) b.send({ t: 'settings', settings: { map, rounds } });
    b.send({ t: 'profile', ready: true });
    b.on(m => { if (m.t === 'lobby' && m.state === 'lobby' && m.players.some(p => p.id === b.id && !p.ready)) b.send({ t: 'profile', ready: true }); });
    bonkBot(b, b.id);
    bots.push(b);
  }
  const host = bots[0], botIds = new Set(bots.map(b => b.id));
  let starting = false;
  host.on(m => {
    if (m.t !== 'lobby') return;
    if (m.state !== 'lobby') { starting = false; return; }
    const humans = m.players.filter(p => !botIds.has(p.id) && p.on !== false);
    if (!starting && humans.length && humans.every(p => p.ready)) { starting = true; setTimeout(() => host.send({ t: 'start' }), 800); }
  });
  console.log(`room ${host.code}: http://localhost:${port}/?room=${host.code}  (press Ready to start; Ctrl+C to stop)`);
}

if (args[0] === '--bonk') bonkMatch(+args[1] || 3101, +args[2] || 4).catch(e => { console.error('FAIL', e.message); process.exit(1); });
else if (args[0] === '--bonk-join') bonkJoin(args[1], +args[2] || 3000, +args[3] || 3);
else if (args[0] === '--bonk-host') bonkHost(+args[1] || 3000, Math.max(1, Math.min(11, +args[2] || 3)), args[3], args[4]);
else if (args[0] === '--host') hostPlay(+args[1] || 3000, +args[2] || 1, args[3]);
else if (args[0] === '--join') joinPlay(args[1], +args[2] || 3000, +args[3] || 3);
else if (args[0] === '--lobby') lobbyOnly(args[1], +args[2] || 3000, +args[3] || 11);
else match(+args[0] || 3100).catch(e => { console.error('FAIL', e.message); process.exit(1); });
