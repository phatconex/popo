const test = require('node:test');
const assert = require('node:assert');
const HS = require('../server/games/hideseek');
const { blocked } = require('../server/games/hideseek/maps');
const { separate, rayHit, BODY_R, HIT_R, RANGE, NPC_AREA, NPC_PER_PLAYER, LISTEN_NEAR, LISTEN_CLOSE, HEARD_T, EDGE } = HS._test;

function fakeApi(n = 2, settings = { map: 'farm', rounds: '2' }) {
  const players = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), av: i, ws: null }));
  const sent = [];
  return { settings, players: () => players, send: () => {}, bcast: d => sent.push(d), end: () => {}, sent };
}

test('meta is English', () => {
  assert.strictEqual(HS.meta.name, 'Hide & Seek');
  assert.deepStrictEqual(HS.meta.settings.map(s => s.label), ['Map', 'Rounds', 'Time']);
  assert.deepStrictEqual(HS.meta.settings[2].options.map(o => o.label), ['2 min', '3 min', '4 min', '5 min']);
  assert.strictEqual(HS.meta.settings[2].def, '180');
  assert.deepStrictEqual(HS.meta.settings[0].options.map(o => o.label), ['Random', 'Farm', 'Snow Village', 'Beach']);
});

test('separate pushes overlapping bodies apart', () => {
  const m = { W: 4800, H: 3300, buildings: [], seas: [], ponds: [], trees: [], props: [], landmarks: [] };
  const a = { x: 1000, y: 1000 }, b = { x: 1010, y: 1000 };
  for (let i = 0; i < 5; i++) separate([a, b], m);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * BODY_R - 1, `distance ${Math.hypot(a.x - b.x, a.y - b.y)}`);
});

test('separate never pushes a body into a pond or off the map', () => {
  const m = { W: 4800, H: 3300, buildings: [], seas: [], ponds: [{ cx: 1000, cy: 1000, rx: 200, ry: 150 }], trees: [], props: [], landmarks: [] };
  const a = { x: 1215, y: 1000 }, b = { x: 1225, y: 1000 }; // a sits on the pond edge, b pushes it in
  const c = { x: 62, y: 500 }, d = { x: 70, y: 500 };       // c at the left border
  for (let i = 0; i < 10; i++) separate([a, b, c, d], m);
  assert.ok(!blocked(m, a.x, a.y, 0), 'a ended in the pond');
  assert.ok(c.x >= EDGE && d.x >= EDGE, 'pushed off the map');
});

test('rayHit: first on the line, misses off-line, range and NaN', () => {
  const near = { o: { x: 300, y: 0 } }, far = { o: { x: 400, y: 0 } }, off = { o: { x: 200, y: HIT_R + 5 } };
  assert.strictEqual(rayHit(0, 0, 500, 0, [far, near, off]), near);
  assert.strictEqual(rayHit(0, 0, 500, 0, [off]), null);
  assert.strictEqual(rayHit(0, 0, 900, 0, [{ o: { x: RANGE + HIT_R + 20, y: 0 } }]), null);
  assert.strictEqual(rayHit(0, 0, NaN, 0, [near]), null);
  assert.strictEqual(rayHit(0, 0, 0, 0, [near]), null);
});

test('start spawns the right number of animals', () => {
  const api = fakeApi(2);
  const g = HS.create(api);
  g.start();
  const m = g.map;
  assert.strictEqual(g.npcs.length, Math.round(m.W * m.H / NPC_AREA) + 2 * NPC_PER_PLAYER);
});

test('a seeker shot that hits a hider catches them', () => {
  const api = fakeApi(2);
  const g = HS.create(api);
  g.start();
  const seeker = [...g.ps.values()].find(p => p.role === 'seeker'), hider = [...g.ps.values()].find(p => p.role === 'hider');
  g.phase = 'playing'; g.time = 100; g.npcs = [];
  seeker.x = 1000; seeker.y = 1000; hider.x = 1200; hider.y = 1000;
  g.onMsg({ id: seeker.id }, { t: 'shoot', x: 1300, y: 1000 });
  assert.strictEqual(hider.alive, false);
  const fx = api.sent.find(d => d.t === 'fx' && d.kind === 'shot');
  assert.strictEqual(fx.hit, 2);
});

test('snapshot k rows carry the seeker avatar', () => {
  const api = fakeApi(2);
  const sends = [];
  api.players().forEach(p => { p.ws = {}; });
  api.send = (p, d) => sends.push(d);
  const g = HS.create(api);
  g.start();
  g.tick(0.05);
  const s = sends.find(d => d.t === 's');
  const seeker = [...g.ps.values()].find(p => p.role === 'seeker');
  assert.strictEqual(s.k[0].length, 8);
  assert.strictEqual(s.k[0][7], api.players().find(p => p.id === seeker.id).av);
});

test('herd is smaller than before (farm, 6 players: under 70 animals)', () => {
  const g = HS.create(fakeApi(6));
  g.start();
  assert.ok(g.npcs.length < 70, `npcs ${g.npcs.length}`);
});

test('round time comes from the Time setting', () => {
  const g = HS.create(fakeApi(2, { map: 'farm', rounds: '2', time: '120' }));
  g.start();
  g.time = 0; g.tick(0.05);
  assert.strictEqual(g.phase, 'playing');
  assert.ok(Math.abs(g.time - 120) < 1, `time ${g.time}`);
  const d = HS.create(fakeApi(2, { map: 'farm', rounds: '2', time: 'junk' }));
  d.start(); d.time = 0; d.tick(0.05);
  assert.ok(Math.abs(d.time - 180) < 1, `default time ${d.time}`);
});

test('a player pushed right next to a tree can still walk away', () => {
  const g = HS.create(fakeApi(2));
  g.start();
  const m = g.map;
  Object.assign(m, { buildings: [], seas: [], ponds: [], props: [], landmarks: [], trees: [[1000, 1000, 0]] });
  g.npcs = []; g.phase = 'playing'; g.time = 100;
  const hider = [...g.ps.values()].find(p => p.role === 'hider');
  const seeker = [...g.ps.values()].find(p => p.role === 'seeker');
  seeker.x = 3000; seeker.y = 2000;
  hider.x = 1000 + 30 + 4; hider.y = 1000;           // inside the walking pad, outside the trunk
  assert.ok(blocked(m, hider.x, hider.y), 'setup: spot counts as blocked for walking');
  hider.input = { mx: 1, my: 0 };
  for (let i = 0; i < 10; i++) g.tick(0.05);
  assert.ok(hider.x > 1060, `hider stuck at ${hider.x}`);
});

test('separate keeps bodies out of the walking pad around trees', () => {
  const m = { W: 4800, H: 3300, buildings: [], seas: [], ponds: [], trees: [[1000, 1000, 0]], props: [], landmarks: [] };
  const a = { x: 1045, y: 1000 }, b = { x: 1050, y: 1000 };
  for (let i = 0; i < 10; i++) separate([a, b], m);
  assert.ok(!blocked(m, a.x, a.y) && !blocked(m, b.x, b.y), `a ${a.x} b ${b.x}`);
});

function seekerSetup() {
  const api = fakeApi(2);
  const sends = [];
  api.players().forEach(p => { p.ws = {}; });
  api.send = (p, d) => sends.push({ p, d });
  const g = HS.create(api);
  g.start();
  g.npcs = []; g.phase = 'playing'; g.time = 100;
  const seeker = [...g.ps.values()].find(p => p.role === 'seeker'), hider = [...g.ps.values()].find(p => p.role === 'hider');
  Object.assign(g.map, { buildings: [], seas: [], ponds: [], props: [], landmarks: [], trees: [] });
  seeker.x = 1000; seeker.y = 1000; seeker.input = {}; hider.input = {};
  const last = id => [...sends].reverse().find(s => s.p.id === id && s.d.t === 's').d;
  return { g, seeker, hider, last };
}

test('no passive proximity hint: seeker snapshots carry no "near" field', () => {
  const { g, seeker, hider, last } = seekerSetup();
  hider.x = 1050; hider.y = 1000; g.tick(0.05);
  assert.strictEqual(last(seeker.id).me.near, undefined);
});

test('listen: level 0 / 1 / 2 by distance, and the ripple names the seeker', () => {
  for (const [dist, level] of [[LISTEN_NEAR + 100, 0], [LISTEN_NEAR - 50, 1], [LISTEN_CLOSE - 50, 2]]) {
    const { g, seeker, hider } = seekerSetup();
    const sends = [], bc = [];
    g.api.send = (p, d) => sends.push(d); g.api.bcast = d => bc.push(d);
    hider.x = 1000 + dist; hider.y = 1000;
    g.onMsg({ id: seeker.id }, { t: 'listen' });
    assert.strictEqual(sends.find(d => d.t === 'sense').level, level, `dist ${dist}`);
    assert.strictEqual(bc.find(d => d.kind === 'listen').by, seeker.id);
  }
});

test('hider calls are loud for everyone', () => {
  const { g, hider } = seekerSetup();
  const sends = [];
  g.api.send = (p, d) => sends.push(d);
  g.onMsg({ id: hider.id }, { t: 'say' });
  const says = sends.filter(d => d.kind === 'say');
  assert.ok(says.length === 2 && says.every(d => d.loud === 1));
});

test('a hider call shows every seeker an arrow toward the call spot for HEARD_T seconds', () => {
  const { g, seeker, hider, last } = seekerSetup();
  hider.x = 1000; hider.y = 1800;                     // straight "down" in map coords
  g.onMsg({ id: hider.id }, { t: 'say' });
  g.tick(0.05);
  assert.ok(Math.abs(last(seeker.id).me.sn - Math.PI / 2) < .05, `angle ${last(seeker.id).me.sn}`);
  hider.x = 3000;                                     // the arrow keeps pointing at where the call came from
  g.tick(0.05);
  assert.ok(Math.abs(last(seeker.id).me.sn - Math.PI / 2) < .05);
  assert.strictEqual(last(hider.id).me.sn, undefined);
  for (let t = 0; t < HEARD_T + .2; t += .05) g.tick(0.05);
  assert.strictEqual(last(seeker.id).me.sn, undefined);
});

test('hiders only have Run, Call and Decoy: swap and sleep do nothing; seekers have no sniff', () => {
  const { g, seeker, hider, last } = seekerSetup();
  const skin = hider.skin;
  g.onMsg({ id: hider.id }, { t: 'skin' });
  g.onMsg({ id: hider.id }, { t: 'sleep' });
  g.onMsg({ id: seeker.id }, { t: 'sniff' });
  g.tick(0.05);
  assert.strictEqual(hider.skin, skin);
  assert.ok(!(hider.sleep > 0));
  assert.deepStrictEqual(Object.keys(last(hider.id).me.cd).sort(), ['decoy', 'listen', 'say']);
  assert.strictEqual(last(seeker.id).me.sn, undefined);
});

test('players can walk right up to the fence on every side', () => {
  const { g, hider, seeker } = seekerSetup();
  const m = g.map;
  seeker.x = m.W / 2; seeker.y = m.H / 2;
  for (const [mx, my, check] of [[-1, 0, () => hider.x <= EDGE + 1], [1, 0, () => hider.x >= m.W - EDGE - 1], [0, -1, () => hider.y <= EDGE + 1], [0, 1, () => hider.y >= m.H - EDGE - 1]]) {
    hider.x = mx ? (mx < 0 ? 200 : m.W - 200) : m.W / 2; hider.y = my ? (my < 0 ? 200 : m.H - 200) : m.H / 2;
    hider.input = { mx, my, run: true };
    for (let i = 0; i < 40; i++) g.tick(0.05);
    assert.ok(check(), `stopped at ${hider.x | 0},${hider.y | 0} going ${mx},${my}`);
  }
  assert.ok(EDGE <= 40);
});

test('auto rounds: everyone seeks about once even with several seekers per round', () => {
  for (const [n, want] of [[2, 2], [4, 4], [6, 3], [7, 4], [12, 4]]) {
    const g = HS.create(fakeApi(n, { map: 'farm', rounds: 'auto' }));
    g.start();
    assert.strictEqual(g.total, want, `${n} players`);
  }
});

test('a call never pushes the clock below Frenzy; seekers hear it without the caller position', () => {
  const api = fakeApi(2);
  const sends = [];
  api.players().forEach(p => { p.ws = {}; });
  api.send = (p, d) => sends.push({ p, d });
  const g = HS.create(api);
  g.start(); g.phase = 'playing'; g.time = 6.5;
  const seeker = [...g.ps.values()].find(p => p.role === 'seeker'), hider = [...g.ps.values()].find(p => p.role === 'hider');
  g.onMsg({ id: hider.id }, { t: 'say' });
  assert.ok(g.time >= 5, `time ${g.time}`);
  const toSeeker = sends.find(s => s.p.id === seeker.id && s.d.kind === 'say').d, toHider = sends.find(s => s.p.id === hider.id && s.d.kind === 'say').d;
  assert.strictEqual(toSeeker.x, undefined);
  assert.strictEqual(typeof toHider.x, 'number');
});

test('decoy makes a nearby herd animal bolt instead of spawning one next to the hider', () => {
  const g = HS.create(fakeApi(2));
  g.start(); g.phase = 'playing'; g.time = 100;
  const hider = [...g.ps.values()].find(p => p.role === 'hider');
  g.npcs = [{ eid: 900, x: hider.x + 120, y: hider.y, tx: hider.x + 120, ty: hider.y, skin: 0, flip: 0, stun: 0, sleep: 0, wait: 0, run: 0 }];
  g.onMsg({ id: hider.id }, { t: 'decoy' });
  assert.strictEqual(g.npcs.length, 1);
  assert.ok(g.npcs[0].run > 0);
});

test('napping herd animals are not flagged in snapshots (hiders cannot nap)', () => {
  const api = fakeApi(2);
  const sends = [];
  api.players().forEach(p => { p.ws = {}; });
  api.send = (p, d) => sends.push(d);
  const g = HS.create(api);
  g.start();
  for (const a of g.npcs) a.sleep = 5;
  g.tick(0.05);
  const s = sends.filter(d => d.t === 's').pop();
  assert.ok(s.e.every(e => !(e[5] & 2)));
});

test('a player leaving during the final results still ends with the winner', () => {
  const api = fakeApi(3);
  let winners = null;
  api.end = w => { winners = w; };
  const g = HS.create(api);
  g.start();
  g.round = g.total;
  const [a, b, c] = [...g.ps.values()];
  g.endRound('hider');
  a.score = 500;                                      // a is the leader whatever role it had
  g.onLeave({ id: b.id }); g.onLeave({ id: c.id });
  assert.deepStrictEqual(winners, [a.id]);
});
