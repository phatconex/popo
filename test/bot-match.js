// Bot match for Hide & Seek over the real network.
//   Full match:   HS_HIDE_T=2 HS_ROUND_T=20 PORT=3100 node server/index.js  &&  node test/bot-match.js 3100
//   Fill a lobby: node test/bot-match.js --lobby ABCD 3000 11   (11 bots join room ABCD and idle; Ctrl+C to stop)
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
    let s = null, id = 0, dir = [0, 0];
    b.on(m => { if (m.t === 'joined') id = m.id; if (m.t === 'g' && m.d.t === 's') s = m.d; });
    setInterval(() => {
      if (!s) return;
      if (Math.random() < .3) dir = Math.random() < .3 ? [0, 0] : [Math.random() * 2 - 1, Math.random() * 2 - 1];
      b.send({ t: 'g', d: { t: 'in', mx: dir[0], my: dir[1], run: false } });
      if (s.me.role === 'seeker' && s.ph === 'playing' && s.e.length && Math.random() < .08) {
        const me = s.k.find(k => k[0] === id); if (!me) return;
        const near = s.e.map(e => [e, Math.hypot(e[1] - me[2], e[2] - me[3])]).sort((x, y) => x[1] - y[1])[0][0];
        b.send({ t: 'g', d: { t: 'shoot', x: near[1], y: near[2] } });
      }
    }, 600);
  }
  console.log(`${n} bots playing in ${code}. Ctrl+C to stop.`);
}

if (args[0] === '--join') joinPlay(args[1], +args[2] || 3000, +args[3] || 3);
else if (args[0] === '--lobby') lobbyOnly(args[1], +args[2] || 3000, +args[3] || 11);
else match(+args[0] || 3100).catch(e => { console.error('FAIL', e.message); process.exit(1); });
