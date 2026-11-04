const test = require('node:test');
const assert = require('node:assert');
const HS = require('../server/games/hideseek');
const { blocked } = require('../server/games/hideseek/maps');
const { separate, rayHit, BODY_R, HIT_R, RANGE } = HS._test;

function fakeApi(n = 2, settings = { map: 'farm', rounds: '2' }) {
  const players = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), av: i, ws: null }));
  const sent = [];
  return { settings, players: () => players, send: () => {}, bcast: d => sent.push(d), end: () => {}, sent };
}

test('meta is English', () => {
  assert.strictEqual(HS.meta.name, 'Hide & Seek');
  assert.deepStrictEqual(HS.meta.settings.map(s => s.label), ['Map', 'Rounds']);
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
  assert.ok(c.x >= 60 && d.x >= 60, 'pushed off the map');
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
  assert.strictEqual(g.npcs.length, Math.round(m.W * m.H / 220000) + 2 * 4);
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
