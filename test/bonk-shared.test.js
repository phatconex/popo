const test = require('node:test');
const assert = require('node:assert');
const BK = require('../public/games/bonk3d/shared.js');

const flat = () => 0;
const edge = (R) => (x, z) => (Math.hypot(x, z) <= R ? 0 : -1);
const surf = (s) => () => s;

// Knock a body along +Z, simulate at 1/60 until stunned-and-stopped, return distance travelled.
function slide(kind, x, ground) {
  const b = BK.newBody(0, 0, 0);
  BK.applyKnock(b, 0, 1, BK.knockOf(kind, x));
  for (let i = 0; i < 60 * 20; i++) {
    BK.step(b, { mx: 0, mz: 0 }, 1 / 60, ground);
    if (b.stun <= 0 && Math.hypot(b.vx, b.vz) < 0.05) break;
  }
  return Math.hypot(b.x, b.z);
}

test('push slides 1-2 m', () => {
  const d = slide('push', 0, flat);
  assert.ok(d >= 1 && d <= 2, `push ${d}`);
});

test('full bonk slides 4-6 m, c=0 shorter than c=1', () => {
  const d1 = slide('bonk', 1, flat), d0 = slide('bonk', 0, flat);
  assert.ok(d1 >= 4 && d1 <= 6, `bonk1 ${d1}`);
  assert.ok(d0 < d1);
});

test('ice slides further, mud shorter; mud walking capped', () => {
  const n = slide('bonk', 1, surf(0)), ice = slide('bonk', 1, surf(1)), mud = slide('bonk', 1, surf(2));
  assert.ok(ice > n && n > mud);
  const b = BK.newBody(0, 0, 0);
  for (let i = 0; i < 300; i++) BK.step(b, { mx: 0, mz: 1 }, 1 / 60, surf(2));
  assert.ok(Math.hypot(b.vx, b.vz) <= 2.65);
  assert.ok(Math.hypot(b.vx, b.vz) > 2.4);
});

test('missed bonk at the edge falls in', () => {
  const R = 5, b = BK.newBody(R - 0.5, 0, Math.PI / 2), g = edge(R);
  assert.ok(BK.startBonk(b) !== false);
  b.charge = 1;
  assert.strictEqual(BK.releaseBonk(b), 1);
  let ev = null;
  for (let i = 0; i < 60 * 3; i++) { const r = BK.step(b, { mx: 0, mz: 0 }, 1 / 60, g); if (r === 'fall') ev = r; }
  assert.strictEqual(ev, 'fall');
  assert.ok(b.falling);
  assert.ok(b.y < BK.FALL_Y);
});

test('step reports land after a knock-up and fall is reported once', () => {
  const b = BK.newBody(0, 0, 0);
  BK.applyKnock(b, 0, 1, BK.knockOf('push', 0));
  let landed = 0;
  for (let i = 0; i < 120; i++) if (BK.step(b, { mx: 0, mz: 0 }, 1 / 60, flat) === 'land') landed++;
  assert.strictEqual(landed, 1);
  const c = BK.newBody(9, 0, 0); let falls = 0;
  for (let i = 0; i < 120; i++) if (BK.step(c, { mx: 0, mz: 0 }, 1 / 60, edge(1)) === 'fall') falls++;
  assert.strictEqual(falls, 1);
});

test('xzToHex inverts hexToXZ', () => {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
    if (BK.ring(q, r) > 5) continue;
    const [x, z] = BK.hexToXZ(q, r);
    assert.deepStrictEqual(BK.xzToHex(x, z).map(v => v + 0), [q, r]);
    for (const [dq, dr] of dirs) {
      const [nx, nz] = BK.hexToXZ(q + dq, r + dr);
      const px = x + (nx - x) * 0.5 * BK.S / Math.hypot(nx - x, nz - z) * 1, pz = z + (nz - z) * 0.5 * BK.S / Math.hypot(nx - x, nz - z) * 1;
      assert.deepStrictEqual(BK.xzToHex(px, pz).map(v => v + 0), [q, r]);
    }
  }
  assert.strictEqual(BK.ring(2, 1), 3);
  assert.ok(Math.abs(BK.islandRadius(2) - (Math.sqrt(3) * BK.S * 2 + BK.S)) < 1e-9);
});

test('pushTargets honours range and cone; bonkTouch only while lunging', () => {
  const a = BK.newBody(0, 0, 0); // facing +Z
  const front = BK.newBody(0, 1, 0), far = BK.newBody(0, 2, 0), side = BK.newBody(1, 0.1, 0), diag = BK.newBody(0.7, 0.7, 0);
  const t = BK.pushTargets(a, [front, far, side, diag]);
  assert.deepStrictEqual(t, [front, diag]);
  assert.strictEqual(BK.bonkTouch(a, front), false);
  a.lunge = 0.1;
  assert.strictEqual(BK.bonkTouch(a, front), true);
  assert.strictEqual(BK.bonkTouch(a, far), false);
  const [dx, dz] = BK.hitDir(a, BK.newBody(1, 1, 0));
  assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9 && dx > 0 && dz > dx);
});

test('actions are refused when stunned, falling or lunging', () => {
  for (const key of ['stun', 'lunge']) {
    const b = BK.newBody(0, 0, 0); b[key] = 0.2;
    assert.strictEqual(BK.startPush(b), false);
    assert.strictEqual(BK.startBonk(b), false);
    assert.strictEqual(BK.startDash(b), false);
  }
  const f = BK.newBody(0, 0, 0); f.falling = true;
  assert.strictEqual(BK.startDash(f), false);
  const b = BK.newBody(0, 0, 0);
  BK.startBonk(b); BK.step(b, { mx: 0, mz: 0 }, 1 / 60, flat);
  assert.ok(b.charging && b.charge > 0);
  assert.notStrictEqual(BK.startDash(b), false);
  assert.strictEqual(b.charging, false);
  assert.strictEqual(b.charge, 0);
  assert.ok(Math.abs(b.vz - BK.DASH.v) < 1e-9);
});

test('knockOf bump and applyKnock', () => {
  const k = BK.knockOf('bump', 10);
  assert.ok(Math.abs(k.power - 4.5) < 1e-9 && k.vy === BK.BUMP.vy && k.stun === BK.BUMP.stun);
  const b = BK.newBody(0, 0, 0); b.vx = 10; b.charging = true; b.lunge = 1; b.dash = 1;
  BK.applyKnock(b, 1, 0, { power: 5, vy: 2, stun: 0.3 });
  assert.ok(Math.abs(b.vx - 7) < 1e-9);
  assert.ok(b.vy === 2 && b.y > 0 && b.stun === 0.3 && !b.charging && b.lunge === 0 && b.dash === 0);
});

test('separate pushes only b out of overlapping bodies at similar height', () => {
  const b = BK.newBody(0, 0, 0), o = BK.newBody(0.4, 0, 0), hi = BK.newBody(0, 0.1, 0); hi.y = 2;
  BK.separate(b, [o, hi]);
  assert.ok(Math.abs(b.x - (0.4 - 2 * BK.BODY_R)) < 1e-9);
  assert.strictEqual(o.x, 0.4);
  assert.strictEqual(b.z, 0);
});

test('interp midpoint, clamps, angle wrap', () => {
  assert.strictEqual(BK.interp([], 1), null);
  const buf = [[0, 0, 0, 0, 0, 0, 0], [1, 2, 4, 6, 3.1, 1, 1]];
  const m = BK.interp(buf, 0.5);
  assert.deepStrictEqual(m.slice(0, 3), [1, 2, 3]);
  assert.deepStrictEqual(BK.interp(buf, -5), [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(BK.interp(buf, 9), [2, 4, 6, 3.1, 1, 1]);
  const w = BK.interp([[0, 0, 0, 0, 3.1, 0, 0], [1, 0, 0, 0, -3.1, 0, 0]], 0.5);
  assert.ok(Math.abs(Math.abs(w[3]) - Math.PI) < 1e-9);
  assert.strictEqual(BK.interp([[0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 1, 1]], 0.7)[4], 1);
});

test('tileState', () => {
  const brk = [0, 0, 5, 8];
  assert.strictEqual(BK.tileState(brk, 4.9), 'ok');
  assert.strictEqual(BK.tileState(brk, 5), 'warn');
  assert.strictEqual(BK.tileState(brk, 7.9), 'warn');
  assert.strictEqual(BK.tileState(brk, 8), 'drop');
});

test('knockOf bonk scales as base + perCharge * c', () => {
  const k = BK.knockOf('bonk', 1);
  assert.ok(Math.abs(k.power - 10) < 1e-9 && Math.abs(k.vy - 4.5) < 1e-9 && Math.abs(k.stun - 0.85) < 1e-9);
  const k0 = BK.knockOf('bonk', 0);
  assert.ok(k0.power === 4.5 && k0.vy === 2 && k0.stun === 0.35);
});
