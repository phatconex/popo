// Blind Drive 3D — math and car physics shared by the server (require) and the browser (window.BD).
// Conventions: metres; heading a, forward = (sin a, cos a); right of a tangent (tx, tz) is (-tz, tx).
(function (root) {
  const CAR = { VMAX: 7, VMAX_OFF: 3.2, VREV: -2.5, ACC: 4.5, BRAKE: 10, DRAG: .45, DRAG_SLICK: .2, TURN: 2.2, TURN_V: 2.5, GRIP: 9, GRIP_SLICK: 1.2, GRIP_ICE: .7, SLOPE_G: 6 };

  // Per map: crossing animals, passenger/rider animals (codes from core3d/animals.js), hill params [min, max, hMin, hMax].
  const THEMES = {
    country: { crossers: [3, 0], riders: [1, 4, 0, 6, 5], hills: [3, 4, 3, 4.5] },
    snow: { crossers: [7, 8], riders: [7, 18, 2, 20], hills: [4, 5, 3.5, 5] },
    beach: { crossers: [11, 12], riders: [11, 13, 10, 12], hills: [1, 2, 1.5, 2.5] },
    night: { crossers: [5, 6], riders: [6, 5, 9, 15], hills: [0, 1, 1, 2] },
  };

  function rng(seed) { // mulberry32
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function heightAt(hills, x, z) {
    let y = 0;
    for (const h of hills) { const dx = x - h.x, dz = z - h.z; y += h.h * Math.exp(-(dx * dx + dz * dz) / (2 * h.s * h.s)); }
    return y;
  }

  function slopeAlong(hills, x, z, a) {
    const fx = Math.sin(a), fz = Math.cos(a);
    return (heightAt(hills, x + .8 * fx, z + .8 * fz) - heightAt(hills, x - .8 * fx, z - .8 * fz)) / 1.6;
  }

  function stepCar(car, inp, env, dt) {
    const gas = inp.gas || 0, brake = inp.brake || 0, rev = inp.rev || 0, steer = Math.max(-1, Math.min(1, inp.steer || 0));
    const slope = env.slope || 0, slick = env.slick || 0, ice = env.ice || 0, off = env.off || 0;
    let v = car.v;
    if (gas) v += (v < 0 ? CAR.BRAKE : CAR.ACC) * dt * gas;
    if (brake) v = v > 0 ? Math.max(0, v - CAR.BRAKE * dt) : Math.min(0, v + CAR.BRAKE * dt);
    if (rev) {
      if (v > .3) v = Math.max(0, v - CAR.BRAKE * dt); // moving forward: acts as a brake
      else v = Math.max(CAR.VREV, v - CAR.ACC * dt);
    }
    if (!gas && !brake && !rev) v *= Math.pow(1 - (slick ? CAR.DRAG_SLICK : CAR.DRAG), dt);
    v -= CAR.SLOPE_G * slope * dt;
    v = Math.max(CAR.VREV, Math.min(off ? CAR.VMAX_OFF : CAR.VMAX, v));
    // positive steer turns right, which means decreasing a
    const da = -steer * CAR.TURN * Math.min(1, Math.abs(v) / CAR.TURN_V) * (v < 0 ? -1 : 1) * dt * (slick ? .6 : 1);
    car.a += da;
    // velocity direction lags the heading: the rotation leaves sideways slip, then grip eats it
    let lat = (car.lat || 0) + v * da;
    lat *= Math.exp(-(ice ? CAR.GRIP_ICE : slick ? CAR.GRIP_SLICK : CAR.GRIP) * dt);
    car.lat = lat;
    car.v = v;
    const fx = Math.sin(car.a), fz = Math.cos(car.a);
    car.x += (fx * v - fz * lat) * dt; // right vector = (-fz, fx)
    car.z += (fz * v + fx * lat) * dt;
  }

  function tangentAt(pts, i) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
  }

  function nearestOnTrack(track, x, z) {
    const pts = track.pts;
    let i = 0, best = Infinity;
    for (let k = 0; k < pts.length; k++) { const d = (pts[k][0] - x) ** 2 + (pts[k][1] - z) ** 2; if (d < best) { best = d; i = k; } }
    const p = [x, z];
    let dist = Math.sqrt(best);
    if (i > 0) dist = Math.min(dist, segDist(p, pts[i - 1], pts[i]));
    if (i < pts.length - 1) dist = Math.min(dist, segDist(p, pts[i], pts[i + 1]));
    const [tx, tz] = tangentAt(pts, i);
    const side = ((x - pts[i][0]) * -tz + (z - pts[i][1]) * tx) >= 0 ? 1 : -1;
    return { i, dist, side, s: pts.length > 1 ? i / (pts.length - 1) : 0 };
  }

  // Slick ellipses: {x, z, rx, rz, a} with rx along heading a, rz across it.
  function inSlick(sl, x, z) {
    const dx = x - sl.x, dz = z - sl.z, a = sl.a || 0, c = Math.cos(a), s = Math.sin(a);
    const u = dx * c - dz * s, w = dx * s + dz * c;
    return (u * u) / (sl.rx * sl.rx) + (w * w) / (sl.rz * sl.rz) <= 1;
  }

  function envAt(track, x, z, a) {
    const n = nearestOnTrack(track, x, z);
    let slick = 0;
    for (const sl of track.slicks || []) if (inSlick(sl, x, z)) { slick = 1; break; }
    return {
      slope: slopeAlong(track.hills || [], x, z, a), slick, ice: slick && track.theme === 'snow' ? 1 : 0,
      off: n.dist > track.rw ? 1 : 0, edge: n.dist - track.rw,
    };
  }

  // c = {i, kind, ph, spd}: walks across the road at pts[c.i], resting 1.5 s on each side.
  function crosserPos(track, c, t) {
    const amp = track.rw + 2, REST = 1.5, T = 2 * amp / c.spd, P = 4 * amp / c.spd + 3;
    const u = (((t + (c.ph || 0)) % P) + P) % P;
    let off, dir;
    if (u < REST) { off = -amp; dir = 0; }
    else if (u < REST + T) { off = -amp + 2 * amp * (u - REST) / T; dir = 1; }
    else if (u < 2 * REST + T) { off = amp; dir = 0; }
    else { off = amp - 2 * amp * (u - 2 * REST - T) / T; dir = -1; }
    const p = track.pts[c.i], [tx, tz] = tangentAt(track.pts, c.i);
    return { x: p[0] - tz * off, z: p[1] + tx * off, dir, onRoad: Math.abs(off) <= track.rw };
  }

  function stopPoints(track, stop) {
    const p = track.pts[stop.i], [tx, tz] = tangentAt(track.pts, stop.i), rw = track.rw;
    const at = d => ({ x: p[0] - tz * stop.side * d, z: p[1] + tx * stop.side * d });
    return { ring: at(rw - .4), pet: at(rw + 1.6) };
  }

  const BD = { CAR, THEMES, rng, heightAt, slopeAlong, stepCar, nearestOnTrack, envAt, crosserPos, stopPoints };
  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
  else root.BD = BD;
})(typeof window !== 'undefined' ? window : this);
