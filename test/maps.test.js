const test = require('node:test');
const assert = require('node:assert');
const { genMap, blocked, THEME_IDS } = require('../server/games/hideseek/maps');

const SIZE = { farm: [4800, 3300], snow: [4500, 3300], beach: [5100, 3000] };
const MIN_TREES = { farm: 40, snow: 48, beach: 30 }; // reduced twice after playtests: map felt crowded
const MAX_TREES = { farm: 44, snow: 54, beach: 34 };
const KINDS = { farm: [0, 3, 4, 1, 6, 5], snow: [7, 8, 2, 18, 20], beach: [11, 12, 13, 10, 15] };

// chỉ xét nhà/biển/ao (không tính cây, đồ vật) để biết một điểm có nằm trong nước hay nhà không
const inWaterOrHouse = (m, x, y) => blocked({ ...m, trees: [], props: [], landmarks: [] }, x, y, 0);

for (const theme of THEME_IDS) {
  test(`map ${theme}: size, kinds, counts`, () => {
    const m = genMap(theme);
    assert.deepStrictEqual([m.W, m.H], SIZE[theme]);
    assert.deepStrictEqual(m.kinds, KINDS[theme]);
    assert.ok(m.trees.length >= MIN_TREES[theme] && m.trees.length <= MAX_TREES[theme], `trees ${m.trees.length}`);
    assert.ok(m.landmarks.length >= 6, `landmarks ${m.landmarks.length}`);
  });

  test(`map ${theme}: nothing placed in water or houses; spawn is free`, () => {
    for (let k = 0; k < 5; k++) {
      const m = genMap(theme);
      for (const [x, y] of m.trees) assert.ok(!inWaterOrHouse(m, x, y), `tree in water ${x},${y}`);
      for (const l of m.landmarks) assert.ok(!inWaterOrHouse(m, l.x, l.y), `landmark ${l.type} in water`);
      assert.ok(!blocked(m, m.spawn.x, m.spawn.y), 'spawn blocked');
    }
  });

  test(`map ${theme}: trees and landmarks block movement`, () => {
    const m = genMap(theme);
    const [tx, ty] = m.trees[0];
    assert.ok(blocked(m, tx, ty), 'tree centre must block');
    const l = m.landmarks[0];
    assert.ok(blocked(m, l.x, l.y), 'landmark centre must block');
    // tìm một điểm trống cách mọi vật cản ≥ 80
    let free = null;
    for (let i = 0; i < 2000 && !free; i++) {
      const x = 100 + Math.random() * (m.W - 200), y = 100 + Math.random() * (m.H - 200);
      if (!blocked(m, x, y, 80)) free = [x, y];
    }
    assert.ok(free, 'map should have open space');
    assert.ok(!blocked(m, free[0], free[1]));
  });
}
