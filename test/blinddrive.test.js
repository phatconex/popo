const test = require('node:test');
const assert = require('node:assert');
const BD = require('../public/games/blinddrive3d/shared.js');

const flat = { slope: 0, slick: 0, ice: 0, off: 0 };
const run = (env, inp, secs, v = 0) => { const c = { x: 0, z: 0, a: 0, v, lat: 0 }; for (let i = 0; i < secs * 60; i++) BD.stepCar(c, inp, env, 1 / 60); return c; };
const track = { pts: Array.from({ length: 21 }, (_, i) => [0, i * 2]), rw: 1.9, hills: [], slicks: [], theme: 'country' };

test('rng is deterministic', () => { const a = BD.rng(42), b = BD.rng(42); assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]); });
test('heightAt sums gaussian hills', () => { const h = [{ x: 0, z: 0, h: 3, s: 10 }]; assert.strictEqual(BD.heightAt(h, 0, 0), 3); assert.ok(BD.heightAt(h, 30, 0) < .1); });
test('slopeAlong is positive going uphill', () => {
  const h = [{ x: 0, z: 10, h: 3, s: 5 }];
  assert.ok(BD.slopeAlong(h, 0, 5, 0) > 0);
  assert.ok(BD.slopeAlong(h, 0, 15, 0) < 0);
});
test('stepCar caps speed on road and grass', () => {
  assert.ok(Math.abs(run(flat, { gas: 1 }, 4).v - BD.CAR.VMAX) < .01);
  assert.ok(run({ ...flat, off: 1 }, { gas: 1 }, 4).v <= BD.CAR.VMAX_OFF + 1e-9);
});
test('stepCar: uphill slower, downhill faster, rolls back with no gas', () => {
  const up = run({ ...flat, slope: .2 }, { gas: 1 }, 2), dn = run({ ...flat, slope: -.2 }, {}, 2, 1), fl = run(flat, { gas: 1 }, 2);
  assert.ok(up.v < fl.v); assert.ok(dn.v > 1);
  assert.ok(run({ ...flat, slope: .2 }, {}, 3, 1).v < 0);
});
test('stepCar reverse is capped and deterministic', () => {
  const r = run(flat, { rev: 1 }, 4); assert.ok(r.v >= BD.CAR.VREV - 1e-9 && r.v < 0);
  assert.deepStrictEqual(run(flat, { gas: 1, steer: .5 }, 3), run(flat, { gas: 1, steer: .5 }, 3));
});
test('stepCar brake stops without reversing; drag only when coasting', () => {
  const b = run(flat, { brake: 1 }, 3, 5); assert.strictEqual(b.v, 0);
  const c = run(flat, {}, 1, 4); assert.ok(Math.abs(c.v - 4 * (1 - BD.CAR.DRAG)) < .02);
});
test('steer right moves toward the right vector', () => {
  const c = run(flat, { gas: 1, steer: 1 }, 1);
  const tx = Math.sin(0), tz = Math.cos(0), rx = -tz, rz = tx; // right vector of heading 0
  assert.ok(c.x * rx + c.z * rz > 0.1);
  const l = run(flat, { gas: 1, steer: -1 }, 1);
  assert.ok(l.x * rx + l.z * rz < -0.1);
});
test('slick surface slides more than grippy road', () => {
  const inp = { gas: 1, steer: 1 };
  const g = run(flat, inp, 1.5, 6), s = run({ ...flat, slick: 1 }, inp, 1.5, 6);
  assert.ok(Math.abs(s.lat) > Math.abs(g.lat));
});
test('crosserPos crosses the road and rests on each side', () => {
  const c = { i: 10, kind: 3, ph: 0, spd: 2 };
  const amp = track.rw + 2, period = 4 * amp / c.spd + 3;
  let maxOff = 0, onRoad = 0, restL = 0, restR = 0;
  const p0 = track.pts[10];
  for (let t = 0; t < period; t += 0.05) {
    const p = BD.crosserPos(track, c, t), off = Math.hypot(p.x - p0[0], p.z - p0[1]);
    maxOff = Math.max(maxOff, off);
    if (p.onRoad) onRoad++;
    if (p.dir === 0) { if (p.x - p0[0] > 0) restL += 0.05; else restR += 0.05; } // right of +z is -x
  }
  assert.ok(Math.abs(maxOff - amp) < 0.1);
  assert.ok(onRoad > 0);
  assert.ok(restL >= 1.4 && restR >= 1.4);
  const a = BD.crosserPos(track, c, 3.3), b = BD.crosserPos(track, c, 3.3 + period);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9);
});
test('nearestOnTrack and envAt', () => {
  const n = BD.nearestOnTrack(track, -1, 10); // 1 m right of pts[5]
  assert.strictEqual(n.i, 5); assert.ok(Math.abs(n.dist - 1) < 1e-9); assert.strictEqual(n.side, 1);
  assert.ok(Math.abs(n.s - 5 / 20) < 1e-9);
  assert.strictEqual(BD.nearestOnTrack(track, 1, 10).side, -1);
  assert.strictEqual(BD.envAt(track, -1, 10, 0).off, 0);
  const e = BD.envAt(track, -3, 10, 0);
  assert.strictEqual(e.off, 1); assert.ok(Math.abs(e.edge - 1.1) < 1e-9);
});
test('envAt slick ellipse and ice on snow', () => {
  const t = { ...track, slicks: [{ x: 0, z: 20, rx: 3, rz: 4, a: 0 }] };
  assert.strictEqual(BD.envAt(t, 0, 20, 0).slick, 1);
  assert.strictEqual(BD.envAt(t, 0, 20, 0).ice, 0);
  assert.strictEqual(BD.envAt(t, 0, 30, 0).slick, 0);
  assert.strictEqual(BD.envAt({ ...t, theme: 'snow' }, 0, 20, 0).ice, 1);
});
test('stopPoints puts ring on the road edge and pet outside', () => {
  const s = BD.stopPoints(track, { i: 10, side: 1 });
  assert.ok(Math.abs(s.ring.x - -(1.9 - .4)) < 1e-9 && s.ring.z === 20);
  assert.ok(Math.abs(s.pet.x - -(1.9 + 1.6)) < 1e-9);
});
test('THEMES covers the four maps', () => {
  for (const k of ['country', 'snow', 'beach', 'night']) assert.ok(BD.THEMES[k].crossers.length && BD.THEMES[k].riders.length && BD.THEMES[k].hills.length === 4);
  assert.deepStrictEqual(BD.THEMES.snow.hills, [4, 5, 3.5, 5]);
});
