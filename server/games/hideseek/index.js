// Trốn Tìm Nông Trại — logic game (server giữ toàn bộ trạng thái để chống gian lận cơ bản).
const { genMap, blocked, THEME_IDS } = require('./maps');

// ---- Luật chơi (chỉnh ở đây cho cân bằng) ----
// chiều cao từng con (để bắn trúng giữa thân); bộ thú mỗi bản đồ nằm ở maps.js
const KIND_H = [30, 40, 32, 32, 28, 36, 36, 34, 24, 30, 48, 22, 22, 30, 52, 28];
const HIDE_T = 15;          // giây cho người trốn đi ẩn
const ROUND_T = 180;        // giây mỗi ván
const NPC_SPD = 55;         // tốc độ thú đi dạo
const WALK = 55;            // người trốn đi bộ = y hệt thú
const RUN = 160;            // chạy nhanh: để lại dấu chân!
const SEEK_SPD = 170;
const RANGE = 480;          // tầm bắn
const HIT_R = 20;
const SHOT_CD = 0.6;
const NPC_PENALTY = 15;     // bắn nhầm thú mất máu
const CATCH_BONUS = 20;     // bắt được người hồi máu
const SAY_CD = 8, SAY_BONUS = 3;          // Kêu: trừ 3s đồng hồ
const SLEEP_T = 5, SLEEP_CD = 25;         // Giả ngủ: bắn trúng cũng như bắn nhầm thú
const DECOY_CD = 15, DECOY_MAX = 2, DECOY_RUN = 3; // Mồi nhử: thả 1 con thú giả chạy đi
const LISTEN_CD = 25;                     // Nghe ngóng (người tìm): biết người trốn gần hay xa
const FOOTPRINT_LIFE = 5;
const ROUND_PAUSE = 7, FINAL_PAUSE = 10;
// Điểm: người tìm +100 mỗi lần bắt cộng số giây còn lại (bắt càng sớm càng nhiều), +50 nếu bắt hết;
// người trốn +2/giây sống sót, +100 nếu sống tới cuối
const PTS_CATCH = 100, PTS_ALL = 50, PTS_PER_SEC = 2, PTS_SURVIVE = 100;

const meta = {
  id: 'hideseek',
  name: 'Trốn Tìm Nông Trại',
  desc: 'Hoá thành thú lẫn vào đàn, hay cầm súng nước đi tìm?',
  min: 2, max: 12, tag: 'Hành động',
  settings: [
    { key: 'map', label: 'Bản đồ', def: 'random', options: [{ v: 'random', label: 'Ngẫu nhiên' }, { v: 'farm', label: 'Nông trại' }, { v: 'snow', label: 'Làng tuyết' }, { v: 'beach', label: 'Bãi biển' }] },
    { key: 'rounds', label: 'Số ván', def: 'auto', options: [{ v: 'auto', label: 'Ai cũng được tìm' }, { v: '2', label: '2 ván' }, { v: '4', label: '4 ván' }, { v: '6', label: '6 ván' }] },
  ],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => { v = +v; return isFinite(v) ? clamp(v, -1, 1) : 0; };
const ceil0 = v => Math.max(0, Math.ceil(v));
const pick = a => a[Math.random() * a.length | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function spot(m, avoid) {
  let x, y;
  do { x = rnd(80, m.W - 80); y = rnd(110, m.H - 60); } while (blocked(m, x, y, 20) || (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 700));
  return { x, y };
}
function pickTarget(m, a) {
  for (let i = 0; i < 8; i++) {
    const tx = clamp(a.x + rnd(-280, 280), 60, m.W - 60), ty = clamp(a.y + rnd(-280, 280), 90, m.H - 40);
    if (!blocked(m, tx, ty)) { a.tx = tx; a.ty = ty; return; }
  }
  a.tx = a.x; a.ty = a.y;
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
    for (const p of players) this.ps.set(p.id, { id: p.id, name: p.name, score: 0, seeks: 0, input: {} });
    const s = this.api.settings.rounds;
    this.total = s === 'auto' ? clamp(players.length, 2, 6) : +s;
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
    const nSeek = Math.max(1, Math.round(gs.length / 4));
    const nNpc = Math.round(m.W * m.H / 100000) + gs.length * 6;
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
        cool: 0, sayCd: 0, sleepCd: 0, sleep: 0, decoyCd: 0, decoys: DECOY_MAX, listenCd: 0, surv: 0, catchPts: 0, pts: 0,
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
    if (this.ps.size < 2) return this.api.end([]);
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
      case 'skin':
        if (live && !playing && g.role === 'hider') { const ks = this.map.kinds; g.skin = ks[(ks.indexOf(g.skin) + 1) % ks.length]; }
        break;
      case 'say':
        if (live && playing && g.role === 'hider' && g.sayCd <= 0) {
          g.sayCd = SAY_CD;
          this.time -= SAY_BONUS;
          this.api.bcast({ t: 'fx', kind: 'say', x: g.x | 0, y: g.y | 0, skin: g.skin });
        }
        break;
      case 'sleep':
        if (live && g.role === 'hider' && g.sleepCd <= 0 && g.sleep <= 0) { g.sleep = SLEEP_T; g.sleepCd = SLEEP_CD; g.moving = false; }
        break;
      case 'decoy':
        if (live && g.role === 'hider' && g.decoyCd <= 0 && g.decoys > 0) {
          g.decoys--;
          g.decoyCd = DECOY_CD;
          let dx = g.dx, dy = g.dy;
          if (!dx && !dy) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
          this.npcs.push({ eid: this.nextEid++, x: g.x, y: g.y, tx: g.x, ty: g.y, skin: g.skin, flip: g.flip, stun: 0, sleep: 0, wait: 0, run: DECOY_RUN, dx, dy });
        }
        break;
      case 'listen':
        if (live && playing && g.role === 'seeker' && g.listenCd <= 0) {
          g.listenCd = LISTEN_CD;
          let best = Infinity;
          for (const h of this.ps.values()) if (h.role === 'hider' && h.alive) best = Math.min(best, Math.hypot(h.x - g.x, h.y - g.y));
          this.api.send(p, { t: 'sense', level: best < 260 ? 2 : best < 650 ? 1 : 0 });
          this.api.bcast({ t: 'fx', kind: 'listen', x: g.x | 0, y: g.y | 0 });
        }
        break;
    }
  }

  shoot(g, tx, ty) {
    if (this.phase !== 'playing' || g.role !== 'seeker' || g.cool > 0 || !isFinite(tx) || !isFinite(ty)) return;
    g.cool = SHOT_CD;
    const sx = g.x, sy = g.y - 24;
    let dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1, len = Math.min(d, RANGE);
    dx /= d; dy /= d;
    // tia nước trúng con vật ĐẦU TIÊN trên đường bay
    let best = null, bt = Infinity;
    const cands = [...this.npcs.map(o => ({ o, npc: true })), ...[...this.ps.values()].filter(q => q.role === 'hider' && q.alive).map(o => ({ o, npc: false }))];
    for (const c of cands) {
      const hy = KIND_H[c.o.skin] * .5, ox = c.o.x - sx, oy = c.o.y - hy - sy;
      const t = ox * dx + oy * dy;
      if (t < 0 || t > len + HIT_R) continue;
      if (Math.abs(ox * dy - oy * dx) < HIT_R && t < bt) { bt = t; best = c; }
    }
    const fx = { t: 'fx', kind: 'shot', x1: sx | 0, y1: sy | 0, x2: (sx + dx * len) | 0, y2: (sy + dy * len) | 0, hit: 0, by: g.id };
    if (best) {
      fx.x2 = best.o.x | 0; fx.y2 = (best.o.y - KIND_H[best.o.skin] * .5) | 0;
      if (best.npc || best.o.sleep > 0) {          // người đang giả ngủ: bị tính như bắn nhầm thú
        if (best.npc) { best.o.stun = 1.4; best.o.sleep = 0; best.o.run = 0; }
        g.hp -= NPC_PENALTY;
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
        if (blocked(m, nx, ny) || nx < 60 || nx > m.W - 60 || ny < 90 || ny > m.H - 40) {
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
      if (blocked(m, nx, ny)) { pickTarget(m, a); continue; }
      a.x = nx; a.y = ny;
      if (Math.abs(dx) > 1) a.flip = dx > 0 ? 1 : 0;
    }
    for (const g of this.ps.values()) {
      if (!g.alive) continue;
      for (const k of ['cool', 'sayCd', 'sleepCd', 'decoyCd', 'listenCd']) if (g[k] > 0) g[k] -= dt;
      if (g.role === 'hider' && playing) g.surv += dt;
      if (g.sleep > 0) { g.sleep -= dt; g.moving = false; continue; }
      if (g.role === 'seeker' && !playing) continue;
      let mx = g.input.mx || 0, my = g.input.my || 0;
      const l = Math.hypot(mx, my);
      if (l < .15) { g.moving = false; continue; }
      if (l > 1) { mx /= l; my /= l; }
      const running = g.role === 'hider' && g.input.run;
      const sp = g.role === 'seeker' ? SEEK_SPD : running ? RUN : WALK;
      const nx = clamp(g.x + mx * sp * dt, 60, m.W - 60), ny = clamp(g.y + my * sp * dt, 90, m.H - 40);
      if (!blocked(m, nx, g.y)) g.x = nx;
      if (!blocked(m, g.x, ny)) g.y = ny;
      if (Math.abs(mx) > .1) g.flip = mx > 0 ? 1 : 0;
      g.moving = true; g.dx = mx; g.dy = my;
      if (running) this.footprint(g, mx, my, dt);
    }
    this.fp = this.fp.filter(f => this.clock - f.t < FOOTPRINT_LIFE);
    if (this.phase === 'hiding' && this.time <= 0) { this.phase = 'playing'; this.time = ROUND_T; this.fp = []; }
    this.checkWin();
    if (this.phase === 'roundEnd') return;
    this.broadcast();
  }

  broadcast() {
    const all = [...this.ps.values()];
    const hiders = all.filter(g => g.role === 'hider' && g.alive);
    const fl = o => (o.stun > 0 ? 1 : 0) | (o.sleep > 0 ? 2 : 0);
    // sắp theo y để vừa vẽ đúng lớp, vừa không lộ ai là người qua thứ tự
    const e = [
      ...this.npcs.map(a => [a.eid, a.x | 0, a.y | 0, a.skin, a.flip, fl(a)]),
      ...hiders.map(g => [g.eid, g.x | 0, g.y | 0, g.skin, g.flip, fl(g)]),
    ].sort((a, b) => a[2] - b[2]);
    const k = all.filter(g => g.role === 'seeker').map(g => [g.id, g.name, g.x | 0, g.y | 0, g.hp, +g.ang.toFixed(2), g.alive ? 1 : 0]);
    const fp = this.fp.map(f => [f.x | 0, f.y | 0, +f.a.toFixed(1), +(this.clock - f.t).toFixed(1)]);
    const base = { t: 's', ph: this.phase, tm: ceil0(this.time), e, k, fp, hl: hiders.length, ht: all.filter(g => g.role === 'hider').length };
    const mates = hiders.map(g => [g.eid, g.name]);
    for (const p of this.api.players()) {
      if (!p.ws) continue;
      const g = this.ps.get(p.id);
      if (!g) continue;
      const msg = {
        ...base,
        me: {
          role: g.role, alive: g.alive, hp: g.hp, eid: g.eid, skin: g.skin, sleep: g.sleep > 0 ? 1 : 0, decoys: g.decoys,
          cd: { say: ceil0(g.sayCd), sleep: ceil0(g.sleepCd), decoy: ceil0(g.decoyCd), listen: ceil0(g.listenCd) },
        },
      };
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

module.exports = { meta, create: api => new HideSeek(api) };
