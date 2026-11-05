const test = require('node:test');
const assert = require('node:assert');
const Core = require('../server/core');
const { ANIMALS } = require('../public/core3d/animals');

// trò chơi giả: kết thúc ngay khi được gọi
let lastApi = null;
const fakeGame = { meta: { id: 'fake', name: 'Fake', min: 1, max: 12, settings: [] }, create: api => { lastApi = api; return { start() {}, tick() {}, onMsg() {}, onRejoin() {}, onLeave() {} }; } };

const teamGame = { meta: { id: 'tg', name: 'Team', min: 2, max: 8, teams: { count: 4, max: 3, names: ['Red', 'Blue', 'Green', 'Yellow'] }, settings: [] }, create: api => { lastApi = api; return { start() {}, tick() {}, onMsg() {}, onRejoin() {}, onLeave() {} }; } };

function sock() {
  const handlers = {};
  return { readyState: 1, out: [], send(s) { this.out.push(JSON.parse(s)); }, on(ev, fn) { handlers[ev] = fn; }, msg(o) { handlers.message(Buffer.from(JSON.stringify(o))); }, last(t) { return [...this.out].reverse().find(m => m.t === t); } };
}

test('animal table has 24 entries in spec order', () => {
  assert.strictEqual(ANIMALS.length, 24);
  assert.deepStrictEqual(ANIMALS[0], { id: 'pig', name: 'Piggy' });
  assert.deepStrictEqual(ANIMALS[23], { id: 'fish', name: 'Fishy' });
});

test('core: avatars, ready flag, English errors, default name', () => {
  const core = new Core({ fake: fakeGame });
  try {
    const a = sock(); core.connect(a); a.msg({ t: 'join', name: '', av: 23, game: 'fake' });
    let lob = a.last('lobby');
    assert.strictEqual(lob.players[0].av, 23);
    assert.strictEqual(lob.players[0].name, 'Player');
    assert.strictEqual(lob.players[0].ready, false);

    const b = sock(); core.connect(b); b.msg({ t: 'join', name: 'Mochi', av: 24, code: lob.code });
    lob = b.last('lobby');
    assert.strictEqual(lob.players[1].av, 0);

    b.msg({ t: 'profile', ready: true });
    assert.strictEqual(a.last('lobby').players[1].ready, true);

    const c = sock(); core.connect(c); c.msg({ t: 'join', name: 'X', code: 'ZZZZ' });
    assert.deepStrictEqual(c.last('err'), { t: 'err', msg: 'Room not found' });

    a.msg({ t: 'start' });
    assert.strictEqual(a.last('lobby').state, 'playing');
    lastApi.end([]);
    lob = a.last('lobby');
    assert.strictEqual(lob.state, 'lobby');
    assert.ok(lob.players.every(p => p.ready === false));
  } finally { core.close(); }
});

function room(core, gameId, n) {
  const socks = [];
  for (let i = 0; i < n; i++) {
    const s = sock(); core.connect(s);
    s.msg(i ? { t: 'join', name: 'P' + i, code: socks[0].last('lobby').code } : { t: 'join', name: 'P0', game: gameId });
    socks.push(s);
  }
  return socks;
}
const teams = s => s.last('lobby').players.map(p => p.team);

test('core: teams', () => {
  const core = new Core({ fake: fakeGame, tg: teamGame });
  try {
    const s = room(core, 'tg', 4);
    assert.deepStrictEqual(teams(s[0]), [-1, -1, -1, -1]);
    s[0].msg({ t: 'profile', team: 2 }); s[1].msg({ t: 'profile', team: 2 }); s[2].msg({ t: 'profile', team: 2 });
    assert.deepStrictEqual(teams(s[0]), [2, 2, 2, -1]);
    s[3].msg({ t: 'profile', team: 2 });
    assert.deepStrictEqual(teams(s[0]), [2, 2, 2, -1]);
    s[0].msg({ t: 'profile', team: -1 });
    assert.deepStrictEqual(teams(s[0]), [-1, 2, 2, -1]);
    s[3].msg({ t: 'profile', team: 2 });
    assert.deepStrictEqual(teams(s[0]), [-1, 2, 2, 2]);
    s[0].msg({ t: 'profile', team: 7 });
    assert.strictEqual(teams(s[0])[0], -1);
  } finally { core.close(); }
});

test('core: profile.team is ignored for games without teams', () => {
  const core = new Core({ fake: fakeGame, tg: teamGame });
  try {
    const s = room(core, 'fake', 1);
    s[0].msg({ t: 'profile', team: 1 });
    assert.deepStrictEqual(teams(s[0]), [-1]);
  } finally { core.close(); }
});

test('core: switching game clears teams', () => {
  const core = new Core({ fake: fakeGame, tg: teamGame });
  try {
    const s = room(core, 'tg', 2);
    s[0].msg({ t: 'profile', team: 0 }); s[1].msg({ t: 'profile', team: 1 });
    assert.deepStrictEqual(teams(s[0]), [0, 1]);
    s[0].msg({ t: 'settings', game: 'fake' });
    s[0].msg({ t: 'settings', game: 'tg' });
    assert.deepStrictEqual(teams(s[0]), [-1, -1]);
  } finally { core.close(); }
});

test('core: meta.max at start', () => {
  const core = new Core({ fake: fakeGame, tg: teamGame });
  try {
    const s = room(core, 'tg', 9);
    s[0].msg({ t: 'start' });
    assert.deepStrictEqual(s[0].last('err'), { t: 'err', msg: 'Max 8 players for this game' });
    assert.strictEqual(s[0].last('lobby').state, 'lobby');
  } finally { core.close(); }
});

test('core: teams survive the end of a game', () => {
  const core = new Core({ fake: fakeGame, tg: teamGame });
  try {
    const s = room(core, 'tg', 2);
    s[0].msg({ t: 'profile', team: 1 }); s[1].msg({ t: 'profile', team: 1 });
    s[0].msg({ t: 'start' });
    assert.strictEqual(s[0].last('lobby').state, 'playing');
    lastApi.end([]);
    assert.strictEqual(s[0].last('lobby').state, 'lobby');
    assert.deepStrictEqual(teams(s[0]), [1, 1]);
  } finally { core.close(); }
});
