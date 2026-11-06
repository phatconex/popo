// Hide & Seek — game logic (the server owns all state as basic anti-cheat).
const { genMap, blocked, THEME_IDS } = require('./maps');

// ---- Luật chơi (chỉnh ở đây cho cân bằng) ----
const HIDE_T = +process.env.HS_HIDE_T || 15;   // giây cho người trốn đi ẩn
const ENV_ROUND_T = +process.env.HS_ROUND_T || 0; // ép thời gian mỗi ván (để test nhanh); không có thì lấy từ cài đặt Time
const ROUND_T = 180;        // mặc định nếu cài đặt Time không hợp lệ
const NPC_SPD = 55;         // tốc độ thú đi dạo
const WALK = 55;            // người trốn đi bộ = y hệt thú
const RUN = 160;            // chạy nhanh: để lại dấu chân!
const SEEK_SPD = 170;
const RANGE = 480;          // tầm bắn
const HIT_R = 35;            // shots are tested on the ground plane (3D view from above)
const BODY_R = 34;           // animals push each other apart
const GRID = 120;
const SHOT_CD = 0.6;
const NPC_PENALTY = 15;     // bắn nhầm thú mất máu
const CATCH_BONUS = 20;     // bắt được người hồi máu
const SAY_CD = 8, SAY_BONUS = 3;          // Kêu: trừ 3s đồng hồ, nhưng người tìm thấy mũi tên chỉ về chỗ vừa kêu
const HEARD_T = 3;                        // mũi tên hiện 3 s
const EDGE = 35;                          // cách hàng rào (đơn vị bản đồ): thú đi sát được tới rào
const DECOY_CD = 20, DECOY_RUN = 3, DECOY_R = 350;     // Phân thân: một con thú gần đó (trong 3,5 m) bỏ chạy để lại dấu chân, hồi 20s
const FRENZY_T = 5, FRENZY_CD = 0.15, FRENZY_SPD = 1.6; // Giờ G: 5s cuối người tìm bắn liên tục, không mất máu, chạy nhanh
const LISTEN_CD = 25;                     // Nghe ngóng (người tìm): biết người trốn gần hay xa
const LISTEN_NEAR = 650, LISTEN_CLOSE = 260; // Nghe ngóng: vòng sóng chuyển đỏ nếu có người trốn trong 6,5 m (rất gần: 2,6 m)
const NPC_AREA = 360000, NPC_PER_PLAYER = 3; // số thú = diện tích / NPC_AREA + 3 mỗi người
const FOOTPRINT_LIFE = 5;
const ROUND_PAUSE = 7, FINAL_PAUSE = 10;
// Điểm: người tìm +100 mỗi lần bắt cộng số giây còn lại (bắt càng sớm càng nhiều), +50 nếu bắt hết;
// người trốn +2/giây sống sót, +100 nếu sống tới cuối
const PTS_CATCH = 100, PTS_ALL = 50, PTS_PER_SEC = 2, PTS_SURVIVE = 100;

const meta = {
  id: 'hideseek',
  name: 'Hide & Seek',
  desc: 'Blend into the herd — or grab the water gun and hunt!',
  min: 2, max: 12, tag: 'Action',
  settings: [
    { key: 'map', label: 'Map', def: 'random', options: [{ v: 'random', label: 'Random' }, { v: 'farm', label: 'Farm' }, { v: 'snow', label: 'Snow Village' }, { v: 'beach', label: 'Beach' }] },
    { key: 'rounds', label: 'Rounds', def: 'auto', options: [{ v: 'auto', label: 'Everyone seeks once' }, { v: '2', label: '2' }, { v: '4', label: '4' }, { v: '6', label: '6' }] },
    { key: 'time', label: 'Time', def: '180', options: [{ v: '120', label: '2 min' }, { v: '180', label: '3 min' }, { v: '240', label: '4 min' }, { v: '300', label: '5 min' }] },
  ],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => { v = +v; return isFinite(v) ? clamp(v, -1, 1) : 0; };
const ceil0 = v => Math.max(0, Math.ceil(v));
const pick = a => a[Math.random() * a.length | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// A step is allowed if it lands in a free spot — or, when the body already stands inside an obstacle's
// walking pad (pushed there by the herd), if it at least stays out of the obstacle itself, so nobody gets stuck.
function canStep(m, x, y, nx, ny) {
  return !blocked(m, nx, ny) || (blocked(m, x, y) && !blocked(m, nx, ny, 0));
}

const seekersFor = n => Math.max(1, Math.round(n / 4));

function spot(m, avoid) {
  let x, y;
  do { x = rnd(EDGE + 20, m.W - EDGE - 20); y = rnd(EDGE + 20, m.H - EDGE - 20); } while (blocked(m, x, y, 20) || (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 700));
  return { x, y };
}
function pickTarget(m, a) {
  for (let i = 0; i < 8; i++) {
    // herd animals roam all the way to the fence too, so a body there is not a giveaway
    const tx = clamp(a.x + rnd(-280, 280), EDGE, m.W - EDGE), ty = clamp(a.y + rnd(-280, 280), EDGE, m.H - EDGE);
    if (!blocked(m, tx, ty)) { a.tx = tx; a.ty = ty; return; }
  }
  a.tx = a.x; a.ty = a.y;
}

// Push overlapping bodies apart (half the overlap each). Uses a grid so we never test every pair.
// A push that would land in a blocked spot or off the map is skipped for that body.
function separate(bodies, m) {
  const cells = new Map(), key = (cx, cy) => cx * 100003 + cy;
  for (const o of bodies) { const k = key(Math.floor(o.x / GRID), Math.floor(o.y / GRID)); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(o); }
  const min = BODY_R * 2;
  const tryMove = (o, nx, ny) => {
    nx = clamp(nx, EDGE, m.W - EDGE); ny = clamp(ny, EDGE, m.H - EDGE);
    if (canStep(m, o.x, o.y, nx, ny)) { o.x = nx; o.y = ny; }
  };
  for (const a of bodies) {
    const cx = Math.floor(a.x / GRID), cy = Math.floor(a.y / GRID);
    for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
      const c = cells.get(key(cx + ix, cy + iy)); if (!c) continue;
      for (const b of c) {
        if (b === a) continue;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < .01) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; } else { dx /= d; dy /= d; }
        const push = (min - d) / 2;
        tryMove(a, a.x - dx * push, a.y - dy * push);
        tryMove(b, b.x + dx * push, b.y + dy * push);
      }
    }
  }
}

// First candidate {o:{x,y}} whose centre lies within HIT_R of the segment from (sx,sy) toward (tx,ty), length ≤ RANGE.
function rayHit(sx, sy, tx, ty, cands) {
  if (![sx, sy, tx, ty].every(isFinite)) return null;
  let dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  dx /= d; dy /= d;
  const len = Math.min(d, RANGE);
  let best = null, bt = Infinity;
  for (const c of cands) {
    const ox = c.o.x - sx, oy = c.o.y - sy, t = ox * dx + oy * dy;
    if (t < 0 || t > len + HIT_R) continue;
    if (Math.abs(ox * dy - oy * dx) < HIT_R && t < bt) { bt = t; best = c; }
  }
  return best;
}

class HideSeek {
  constructor(api) {
    this.api = api;
    this.ps = new Map();   // id -> trạng thái trong game
    this.round = 0;
    this.clock = 0;
    this.prevTheme = null;
  }

  start() {
    const players = this.api.players();
    for (const p of players) this.ps.set(p.id, { id: p.id, name: p.name, av: p.av | 0, score: 0, seeks: 0, input: {} });
    const s = this.api.settings.rounds;
    // auto: enough rounds for everyone to seek once (several seekers per round with many players)
    this.total = s === 'auto' ? clamp(Math.ceil(players.length / seekersFor(players.length)), 2, 6) : +s;
    this.newRound();
  }

  newRound() {
    this.round++;
    let theme = this.api.settings.map;
    if (!THEME_IDS.includes(theme)) { const opts = THEME_IDS.filter(t => t !== this.prevTheme); theme = opts[Math.random() * opts.length | 0]; }
    this.prevTheme = theme;
    const m = this.map = genMap(theme);
    // xoay vòng: ai làm người tìm ít nhất thì tới lượt
    const gs = shuffle([...this.ps.values()]).sort((a, b) => a.seeks - b.seeks);
    const nSeek = seekersFor(gs.length);
    const nNpc = Math.round(m.W * m.H / NPC_AREA) + gs.length * NPC_PER_PLAYER;
    const eids = shuffle([...Array(nNpc + gs.length).keys()].map(i => i + 1));
    this.nextEid = nNpc + gs.length + 1;
    this.npcs = [];
    this.fp = [];
    for (let i = 0; i < nNpc; i++) {
      const a = { eid: eids.pop(), ...spot(m), skin: pick(m.kinds), wait: rnd(0, 3), flip: Math.random() < .5 ? 1 : 0, stun: 0, sleep: 0, run: 0 };
      pickTarget(m, a);
      this.npcs.push(a);
    }
    gs.forEach((g, i) => {
      Object.assign(g, {
        role: i < nSeek ? 'seeker' : 'hider', alive: true, hp: 100, input: {}, ang: 0, flip: 0, dx: 0, dy: 0, moving: false,
        cool: 0, sayCd: 0, decoyCd: 0, listenCd: 0, heard: 0, hx: 0, hy: 0, surv: 0, catchPts: 0, pts: 0,
      });
      if (g.role === 'seeker') { g.seeks++; g.x = m.spawn.x + (i - (nSeek - 1) / 2) * 50; g.y = m.spawn.y; }
      else { Object.assign(g, spot(m, m.spawn)); g.skin = pick(m.kinds); g.eid = eids.pop(); }
    });
    this.phase = 'hiding';
    this.time = HIDE_T;
    this.lastRound = null;
    for (const p of this.api.players()) this.sendInit(p);
  }

  sendInit(p) {
    const g = this.ps.get(p.id);
    if (g) this.api.send(p, { t: 'init', map: this.map, role: g.role, round: this.round, total: this.total });
  }
  onRejoin(p) {
    this.sendInit(p);
    if (this.lastRound) this.api.send(p, this.lastRound);
  }
  onDisconnect(p) { const g = this.ps.get(p.id); if (g) g.input = {}; }
  onLeave(p) {
    this.ps.delete(p.id);
    if (this.ps.size < 2) return this.phase === 'roundEnd' && this.round >= this.total ? this.finish() : this.api.end([]);
    this.checkWin();
  }

  onMsg(p, d) {
    const g = this.ps.get(p.id);
    if (!g) return;
    const live = (this.phase === 'hiding' || this.phase === 'playing') && g.alive;
    const playing = this.phase === 'playing';
    switch (d.t) {
      case 'in':
        g.input = { mx: num(d.mx), my: num(d.my), run: !!d.run };
        if (typeof d.ang === 'number' && isFinite(d.ang)) g.ang = d.ang;
        break;
      case 'shoot': if (live) this.shoot(g, +d.x, +d.y); break;
      case 'say':
        if (live && playing && g.role === 'hider' && g.sayCd <= 0) {
          g.sayCd = SAY_CD;
          if (this.time > FRENZY_T) this.time = Math.max(FRENZY_T, this.time - SAY_BONUS); // never skips Frenzy
          // hiders see the speech bubble on the caller; seekers only hear it and get the arrow (no exact animal)
          for (const p of this.api.players()) {
            const s = this.ps.get(p.id);
            if (!s) continue;
            if (s.role !== 'seeker') { this.api.send(p, { t: 'fx', kind: 'say', x: g.x | 0, y: g.y | 0, skin: g.skin, loud: 1 }); continue; }
            this.api.send(p, { t: 'fx', kind: 'say', skin: g.skin, loud: 1 });
            if (s.alive) { Object.assign(s, { heard: HEARD_T, hx: g.x, hy: g.y }); this.api.send(p, { t: 'heard' }); }
          }
        }
        break;
      case 'decoy':
        if (live && g.role === 'hider' && g.decoyCd <= 0) {
          g.decoyCd = DECOY_CD;
          let dx = g.dx, dy = g.dy;
          if (!dx && !dy) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
          // a nearby herd animal bolts off (nothing appears out of thin air next to the hider)
          let near = null, nd = DECOY_R;
          for (const a of this.npcs) { const d = Math.hypot(a.x - g.x, a.y - g.y); if (d < nd && a.stun <= 0 && !(a.run > 0)) { nd = d; near = a; } }
          if (near) Object.assign(near, { sleep: 0, wait: 0, run: DECOY_RUN, dx, dy });
          else this.npcs.push({ eid: this.nextEid++, x: g.x, y: g.y, tx: g.x, ty: g.y, skin: g.skin, flip: g.flip, stun: 0, sleep: 0, wait: 0, run: DECOY_RUN, dx, dy });
        }
        break;
      case 'listen':
        if (live && playing && g.role === 'seeker' && g.listenCd <= 0) {
          g.listenCd = LISTEN_CD;
          const best = this.nearestHider(g);
          this.api.send(p, { t: 'sense', level: best < LISTEN_CLOSE ? 2 : best < LISTEN_NEAR ? 1 : 0 });
          this.api.bcast({ t: 'fx', kind: 'listen', x: g.x | 0, y: g.y | 0, by: g.id }); // others see a plain ripple; the seeker's own comes with the result
        }
        break;
    }
  }

  shoot(g, tx, ty) {
    if (this.phase !== 'playing' || g.role !== 'seeker' || g.cool > 0 || !isFinite(tx) || !isFinite(ty)) return;
    const frenzy = this.frenzy();
    g.cool = frenzy ? FRENZY_CD : SHOT_CD;
    const sx = g.x, sy = g.y;
    const cands = [...this.npcs.map(o => ({ o, npc: true })), ...[...this.ps.values()].filter(q => q.role === 'hider' && q.alive).map(o => ({ o, npc: false }))];
    const best = rayHit(sx, sy, tx, ty, cands);
    const d = Math.hypot(tx - sx, ty - sy) || 1, len = Math.min(d, RANGE);
    const fx = { t: 'fx', kind: 'shot', x1: sx | 0, y1: sy | 0, x2: (sx + (tx - sx) / d * len) | 0, y2: (sy + (ty - sy) / d * len) | 0, hit: 0, by: g.id };
    if (best) {
      fx.x2 = best.o.x | 0; fx.y2 = best.o.y | 0;
      if (best.npc) {
        best.o.stun = 1.4; best.o.sleep = 0; best.o.run = 0;
        if (frenzy) fx.free = 1; else g.hp -= NPC_PENALTY;
        fx.hit = 1;
        if (g.hp <= 0) { g.hp = 0; g.alive = false; }
      } else {
        best.o.alive = false;
        g.hp = Math.min(100, g.hp + CATCH_BONUS);
        g.catchPts += PTS_CATCH + ceil0(this.time);
        Object.assign(fx, { hit: 2, name: best.o.name, seeker: g.name, skin: best.o.skin, vid: best.o.id });
      }
    }
    this.api.bcast(fx);
    if (!g.alive) this.api.bcast({ t: 'fx', kind: 'down', name: g.name });
    this.checkWin();
  }

  roundT() {
    if (ENV_ROUND_T) return ENV_ROUND_T;
    const v = +this.api.settings.time;
    return meta.settings[2].options.some(o => +o.v === v) ? v : ROUND_T;
  }

  // Distance from g to the nearest living hider (Infinity if none).
  nearestHider(g) {
    let best = Infinity;
    for (const h of this.ps.values()) if (h.role === 'hider' && h.alive) best = Math.min(best, Math.hypot(h.x - g.x, h.y - g.y));
    return best;
  }

  frenzy() { return this.phase === 'playing' && this.time <= FRENZY_T; }

  footprint(o, dx, dy, dt) {
    o.fpT = (o.fpT || 0) - dt;
    if (o.fpT > 0) return;
    o.fpT = .22;
    o.fpSide = !o.fpSide;
    const a = Math.atan2(dy, dx), s = o.fpSide ? 5 : -5;
    this.fp.push({ x: o.x - Math.sin(a) * s, y: o.y + Math.cos(a) * s, a, t: this.clock });
  }

  tick(dt) {
    this.clock += dt;
    if (this.phase === 'roundEnd') {
      if ((this.wait -= dt) <= 0) this.round >= this.total ? this.finish() : this.newRound();
      return;
    }
    const m = this.map, playing = this.phase === 'playing';
    this.time -= dt;
    for (const a of this.npcs) {
      if (a.stun > 0) { a.stun -= dt; continue; }
      if (a.sleep > 0) { a.sleep -= dt; continue; }
      if (a.run > 0) { // mồi nhử đang chạy
        a.run -= dt;
        const nx = a.x + a.dx * RUN * dt, ny = a.y + a.dy * RUN * dt;
        if (!canStep(m, a.x, a.y, nx, ny) || nx < EDGE || nx > m.W - EDGE || ny < EDGE || ny > m.H - EDGE) {
          const ang = Math.atan2(-a.dy, -a.dx) + rnd(-.8, .8);
          a.dx = Math.cos(ang); a.dy = Math.sin(ang);
        } else { a.x = nx; a.y = ny; if (Math.abs(a.dx) > .1) a.flip = a.dx > 0 ? 1 : 0; this.footprint(a, a.dx, a.dy, dt); }
        if (a.run <= 0) { a.wait = rnd(.5, 2); pickTarget(m, a); }
        continue;
      }
      if (playing && Math.random() < dt * 0.004) this.api.bcast({ t: 'fx', kind: 'say', x: a.x | 0, y: a.y | 0, skin: a.skin });
      if (a.wait > 0) { a.wait -= dt; continue; }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d < 4) {
        if (Math.random() < .12) a.sleep = rnd(4, 8); else a.wait = rnd(.8, 4);
        pickTarget(m, a);
        continue;
      }
      const s = Math.min(d, NPC_SPD * dt), nx = a.x + dx / d * s, ny = a.y + dy / d * s;
      if (!canStep(m, a.x, a.y, nx, ny)) { pickTarget(m, a); continue; }
      a.x = nx; a.y = ny;
      if (Math.abs(dx) > 1) a.flip = dx > 0 ? 1 : 0;
    }
    for (const g of this.ps.values()) {
      if (!g.alive) continue;
      for (const k of ['cool', 'sayCd', 'decoyCd', 'listenCd', 'heard']) if (g[k] > 0) g[k] -= dt;
      if (g.role === 'hider' && playing) g.surv += dt;
      if (g.role === 'seeker' && !playing) continue;
      let mx = g.input.mx || 0, my = g.input.my || 0;
      const l = Math.hypot(mx, my);
      if (l < .15) { g.moving = false; continue; }
      if (l > 1) { mx /= l; my /= l; }
      const running = g.role === 'hider' && g.input.run;
      const sp = g.role === 'seeker' ? SEEK_SPD * (this.frenzy() ? FRENZY_SPD : 1) : running ? RUN : WALK;
      const nx = clamp(g.x + mx * sp * dt, EDGE, m.W - EDGE), ny = clamp(g.y + my * sp * dt, EDGE, m.H - EDGE);
      if (canStep(m, g.x, g.y, nx, g.y)) g.x = nx;
      if (canStep(m, g.x, g.y, g.x, ny)) g.y = ny;
      if (Math.abs(mx) > .1) g.flip = mx > 0 ? 1 : 0;
      g.moving = true; g.dx = mx; g.dy = my;
      if (running) this.footprint(g, mx, my, dt);
    }
    const bodies = [...this.npcs, ...[...this.ps.values()].filter(g => g.alive && !(g.role === 'seeker' && !playing))];
    separate(bodies, m);
    this.fp = this.fp.filter(f => this.clock - f.t < FOOTPRINT_LIFE);
    if (this.phase === 'hiding' && this.time <= 0) { this.phase = 'playing'; this.time = this.roundT(); this.fp = []; }
    this.checkWin();
    if (this.phase === 'roundEnd') return;
    this.broadcast();
  }

  broadcast() {
    const all = [...this.ps.values()];
    const hiders = all.filter(g => g.role === 'hider' && g.alive);
    const fl = o => (o.stun > 0 ? 1 : 0); // napping herd animals look idle: hiders can't nap, so a Zzz would give them away
    // sắp theo y để vừa vẽ đúng lớp, vừa không lộ ai là người qua thứ tự
    const e = [
      ...this.npcs.map(a => [a.eid, a.x | 0, a.y | 0, a.skin, a.flip, fl(a)]),
      ...hiders.map(g => [g.eid, g.x | 0, g.y | 0, g.skin, g.flip, fl(g)]),
    ].sort((a, b) => a[2] - b[2]);
    const k = all.filter(g => g.role === 'seeker').map(g => [g.id, g.name, g.x | 0, g.y | 0, g.hp, +g.ang.toFixed(2), g.alive ? 1 : 0, g.av]);
    const fp = this.fp.map(f => [f.x | 0, f.y | 0, +f.a.toFixed(1), +(this.clock - f.t).toFixed(1)]);
    const base = { t: 's', ph: this.phase, tm: ceil0(this.time), e, k, fp, hl: hiders.length, fz: this.frenzy() ? 1 : 0, ht: all.filter(g => g.role === 'hider').length };
    const mates = hiders.map(g => [g.eid, g.name]);
    for (const p of this.api.players()) {
      if (!p.ws) continue;
      const g = this.ps.get(p.id);
      if (!g) continue;
      const msg = {
        ...base,
        me: {
          role: g.role, alive: g.alive, hp: g.hp, eid: g.eid, skin: g.skin,
          cd: { say: ceil0(g.sayCd), decoy: ceil0(g.decoyCd), listen: ceil0(g.listenCd) },
        },
      };
      if (g.role === 'seeker' && g.alive && this.phase === 'playing') {
        if (g.heard > 0) msg.me.sn = +Math.atan2(g.hy - g.y, g.hx - g.x).toFixed(2); // arrow toward the last call
      }
      if (g.role === 'hider' || !g.alive) msg.mates = mates; // người tìm còn sống KHÔNG biết ai là ai
      this.api.send(p, msg);
    }
  }

  checkWin() {
    if (this.phase !== 'playing' && this.phase !== 'hiding') return;
    const gs = [...this.ps.values()];
    const h = gs.filter(g => g.role === 'hider' && g.alive).length;
    const s = gs.filter(g => g.role === 'seeker' && g.alive).length;
    if (!h) this.endRound('seeker');
    else if (!s) this.endRound('hider');
    else if (this.phase === 'playing' && this.time <= 0) this.endRound('hider');
  }

  endRound(winner) {
    this.phase = 'roundEnd';
    const gs = [...this.ps.values()];
    for (const g of gs) {
      g.pts = g.role === 'seeker' ? g.catchPts + (winner === 'seeker' ? PTS_ALL : 0)
        : Math.round(g.surv * PTS_PER_SEC) + (g.alive ? PTS_SURVIVE : 0);
      g.score += g.pts;
    }
    const last = this.round >= this.total;
    this.wait = last ? FINAL_PAUSE : ROUND_PAUSE;
    this.lastRound = {
      t: 'round', winner, round: this.round, total: this.total, last, wait: this.wait,
      rows: gs.map(g => ({ id: g.id, name: g.name, role: g.role, alive: g.alive, skin: g.skin, pts: g.pts, score: g.score })).sort((a, b) => b.score - a.score),
    };
    this.api.bcast(this.lastRound);
  }

  finish() {
    const gs = [...this.ps.values()];
    const top = Math.max(...gs.map(g => g.score));
    this.api.end(gs.filter(g => g.score === top && top > 0).map(g => g.id));
  }
}

module.exports = { meta, create: api => new HideSeek(api), _test: { separate, rayHit, BODY_R, HIT_R, RANGE, NPC_AREA, NPC_PER_PLAYER, LISTEN_NEAR, LISTEN_CLOSE, HEARD_T, EDGE } };
