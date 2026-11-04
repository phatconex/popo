const test = require('node:test');
const assert = require('node:assert');
const Core = require('../server/core');
const { ANIMALS } = require('../public/core3d/animals');

// trò chơi giả: kết thúc ngay khi được gọi
let lastApi = null;
const fakeGame = { meta: { id: 'fake', name: 'Fake', min: 1, max: 12, settings: [] }, create: api => { lastApi = api; return { start() {}, tick() {}, onMsg() {}, onRejoin() {}, onLeave() {} }; } };

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
