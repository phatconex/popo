// Bonk Island — shared physics. Used by the server (require), the browser (window.BK) and the bot script.
// Metres, radians, facing f = atan2(dirX, dirZ) (models face +Z). Plain objects only: no DOM, no three.js.
(function (root) {
  const S = 1.05, WATER_Y = -1.15, FALL_Y = -1.1, GRAV = 24, BODY_R = .4, STEP = 1 / 120, TURN = 14, FR_AIR = .9;
  const CHARGE_T = .9, CHARGE_SPEED = 1.7;
  const SURF = [{ speed: 4.4, accel: 14, fric: 4 }, { speed: 4.4, accel: 4, fric: 1.8 }, { speed: 2.6, accel: 14, fric: 9 }]; // normal, ice, mud
  const CD = { push: .45, bonk: 1.1, dash: 2.2, nut: 3.5 };
  const PUSH = { range: 1.25, cone: 1.15, power: 4.6, vy: 1.8, stun: .3, nudge: 2 };
  const BONK = { lungeT: .2, lungeV: [7, 3], ahead: .55, radius: .9, power: [4.5, 5.5], vy: [2, 2.5], stun: [.35, .5], hitLungeT: .06, hitSlow: .3 };
  const DASH = { t: .2, v: 10 };
  const BUMP = { min: 4.5, share: .45, stun: .2, vy: 1.2 };
  const NUT = { h: 9, g: 14, r: 1.4, power: 4.8, vy: 3, stun: .5, aim: 7 };
  const KO_WINDOW = 4;
  const REACH = { push: 1.25, bonk: 1.45, dash: .8 };

  const SQ3 = Math.sqrt(3);
  const hexToXZ = (q, r) => [S * SQ3 * (q + r / 2), S * 1.5 * r];
  function xzToHex(x, z) {
    const r = z / (1.5 * S), q = x / (SQ3 * S) - r / 2;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return [rx + 0, rz + 0]; // + 0 turns -0 into 0
  }
  const ring = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const islandRadius = (rings) => SQ3 * S * rings + S;
  const tileState = (brk, c) => (c < brk[2] ? 'ok' : c < brk[3] ? 'warn' : 'drop');

  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  function newBody(x, z, f) {
    return { x, z, y: 0, vx: 0, vz: 0, vy: 0, f, stun: 0, lunge: 0, lungeC: 0, dash: 0, charging: false, charge: 0, falling: false };
  }

  // Advance one body by dt. groundAt(x, z) -> -1 (no tile / dropped) or surface 0/1/2. Returns 'fall' | 'land' | null.
  function step(b, inp, dt, groundAt) {
    let ev = null;
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-9)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const e = sub(b, inp, h, groundAt);
      if (e === 'fall' || (e && !ev)) ev = e;
    }
    return ev;
  }
  function sub(b, inp, dt, groundAt) {
    if (b.falling) {
      b.vy -= GRAV * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.z += b.vz * dt;
      const k = Math.exp(-.6 * dt); b.vx *= k; b.vz *= k;
      return null;
    }
    const air = b.y > 0 || b.vy > 0;
    const g = groundAt(b.x, b.z), sf = SURF[g < 0 ? 0 : g];
    if (b.stun > 0) {
      b.stun -= dt; const k = Math.exp(-(air ? FR_AIR : sf.fric) * dt); b.vx *= k; b.vz *= k;
    } else if (b.lunge > 0) b.lunge -= dt;
    else if (b.dash > 0) b.dash -= dt;
    else {
      const mx = inp.mx || 0, mz = inp.mz || 0, sp = b.charging ? CHARGE_SPEED : sf.speed, k = 1 - Math.exp(-sf.accel * dt);
      b.vx += (mx * sp - b.vx) * k; b.vz += (mz * sp - b.vz) * k;
      if (mx || mz) b.f += angDiff(Math.atan2(mx, mz), b.f) * Math.min(1, dt * TURN);
    }
    if (b.charging) b.charge = Math.min(1, b.charge + dt / CHARGE_T);
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (air) {
      b.vy -= GRAV * dt; b.y += b.vy * dt;
      if (b.y <= 0) {
        if (groundAt(b.x, b.z) >= 0) { b.y = 0; b.vy = 0; return 'land'; }
        b.falling = true; return 'fall';
      }
    } else if (groundAt(b.x, b.z) < 0) { b.falling = true; return 'fall'; }
    return null;
  }

  const busy = (b) => b.stun > 0 || b.falling || b.lunge > 0;
  const startBonk = (b) => { if (busy(b)) return false; b.charging = true; b.charge = 0; return true; };
  function releaseBonk(b) {
    if (!b.charging) return -1;
    b.charging = false;
    if (busy(b)) { b.charge = 0; return -1; }
    const c = b.charge, v = BONK.lungeV[0] + BONK.lungeV[1] * c;
    b.charge = 0; b.lunge = BONK.lungeT; b.lungeC = c; b.vx = Math.sin(b.f) * v; b.vz = Math.cos(b.f) * v;
    return c;
  }
  function startPush(b) {
    if (busy(b)) return false;
    b.vx += Math.sin(b.f) * PUSH.nudge; b.vz += Math.cos(b.f) * PUSH.nudge;
    return true;
  }
  function startDash(b) {
    if (busy(b)) return false;
    b.dash = DASH.t; b.charging = false; b.charge = 0; b.vx = Math.sin(b.f) * DASH.v; b.vz = Math.cos(b.f) * DASH.v;
    return true;
  }

  function pushTargets(att, others) {
    return others.filter((o) => {
      if (o === att) return false;
      const dx = o.x - att.x, dz = o.z - att.z;
      return Math.hypot(dx, dz) <= PUSH.range && Math.abs(angDiff(Math.atan2(dx, dz), att.f)) <= PUSH.cone;
    });
  }
  function bonkTouch(att, o) {
    if (!(att.lunge > 0)) return false;
    return Math.hypot(o.x - (att.x + Math.sin(att.f) * BONK.ahead), o.z - (att.z + Math.cos(att.f) * BONK.ahead)) <= BONK.radius;
  }
  function hitDir(att, o) {
    const fx = Math.sin(att.f), fz = Math.cos(att.f), tx = o.x - att.x, tz = o.z - att.z, d = Math.hypot(tx, tz) || 1;
    const x = fx * .7 + tx / d * .3, z = fz * .7 + tz / d * .3, m = Math.hypot(x, z) || 1;
    return [x / m, z / m];
  }
  function knockOf(kind, x) {
    if (kind === 'push') return { power: PUSH.power, vy: PUSH.vy, stun: PUSH.stun };
    if (kind === 'bonk') return { power: BONK.power[0] + BONK.power[1] * x, vy: BONK.vy[0] + BONK.vy[1] * x, stun: BONK.stun[0] + BONK.stun[1] * x };
    if (kind === 'nut') return { power: NUT.power, vy: NUT.vy, stun: NUT.stun };
    if (kind === 'bump') return { power: BUMP.share * x, vy: BUMP.vy, stun: BUMP.stun };
    throw new Error('unknown knock kind: ' + kind);
  }
  function applyKnock(b, dx, dz, k) {
    b.vx = dx * k.power + b.vx * .2; b.vz = dz * k.power + b.vz * .2; b.vy = Math.max(b.vy, k.vy); b.y = Math.max(b.y, .001);
    b.stun = Math.max(b.stun, k.stun); b.charging = false; b.charge = 0; b.lunge = 0; b.dash = 0;
  }
  function separate(b, others) {
    for (const o of others) {
      if (o === b || Math.abs(b.y - o.y) > .7) continue;
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), m = BODY_R * 2;
      if (d >= m || d === 0) continue;
      b.x = o.x + dx / d * m; b.z = o.z + dz / d * m;
    }
  }

  // buf rows: [t, x, z, y, f, fl, ch], sorted by t. Returns [x, z, y, f, fl, ch] or null.
  function interp(buf, t) {
    if (!buf.length) return null;
    const out = (r) => [r[1], r[2], r[3], r[4], r[5], r[6]];
    if (t <= buf[0][0]) return out(buf[0]);
    const last = buf[buf.length - 1];
    if (t >= last[0]) return out(last);
    let i = 1; while (buf[i][0] < t) i++;
    const a = buf[i - 1], c = buf[i], u = (t - a[0]) / (c[0] - a[0]), near = u < .5 ? a : c;
    return [a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u, a[3] + (c[3] - a[3]) * u, a[4] + angDiff(c[4], a[4]) * u, near[5], near[6]];
  }

  const BK = {
    S, WATER_Y, FALL_Y, GRAV, BODY_R, STEP, TURN, FR_AIR, CHARGE_T, CHARGE_SPEED, SURF, CD, PUSH, BONK, DASH, BUMP, NUT, KO_WINDOW, REACH,
    hexToXZ, xzToHex, ring, islandRadius, tileState, newBody, step, startBonk, releaseBonk, startPush, startDash,
    pushTargets, bonkTouch, hitDir, knockOf, applyKnock, separate, interp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BK;
  else root.BK = BK;
})(typeof window !== 'undefined' ? window : this);
