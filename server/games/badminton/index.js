// Cầu Lông Thú — 1 đấu 1 hoặc 2 đấu 2.
// Mạng: mỗi cú đánh chỉ gửi một lần (điểm đánh + vận tốc), máy nào cũng tự tính đường bay giống nhau.
// Người đứng bên sân nào thì máy người đó báo "đỡ trúng" (kèm thời điểm theo đồng hồ của họ),
// server kiểm tra hợp lý rồi phát đường bay mới cho cả phòng.
const P = require('../../../public/games/badminton/physics');

const MAPS = { garden: 'Sân vườn', beach: 'Bãi biển', snow: 'Sân tuyết' };
const meta = {
  id: 'badminton', name: 'Cầu Lông Thú', desc: 'Đánh cầu với các bé thú, có gió, có quà', tag: 'Thể thao', min: 2, max: 4,
  settings: [
    { key: 'map', label: 'Sân', def: 'random', options: [{ v: 'random', label: 'Ngẫu nhiên' }, ...Object.entries(MAPS).map(([v, label]) => ({ v, label }))] },
    { key: 'points', label: 'Chơi tới', def: 11, options: [{ v: 7, label: '7 điểm' }, { v: 11, label: '11 điểm' }, { v: 15, label: '15 điểm' }] },
    { key: 'items', label: 'Hộp quà', def: 1, options: [{ v: 1, label: 'Bật' }, { v: 0, label: 'Tắt' }] },
  ],
};

const PICK_T = 12, SERVE_T = 6, POINT_T = 1.6, OVER_T = 10, GRACE = .3, HOT_RALLY = 10;
const ITEMS = ['big', 'fire', 'ghost', 'slow'];
const BIG_T = 15, SLOW_T = 8;

class Badminton {
  constructor(api) {
    this.api = api;
    const ps = api.players().filter(p => p.connected).slice(0, 4);
    this.teams = [[], []];
    ps.forEach((p, i) => this.teams[i % 2].push(p.id));
    this.points = api.settings.points || 11;
    this.itemsOn = api.settings.items !== 0;
    this.map = MAPS[api.settings.map] ? api.settings.map : Object.keys(MAPS)[Math.random() * 3 | 0];
    this.picks = {}; this.pos = {};
    this.score = [0, 0]; this.serveTeam = 0; this.serveIdx = [0, 0];
    this.T = 0; this.time = PICK_T; this.phase = 'pick';
    this.tr = null; this.rt = 0; this.lastTeam = -1; this.rally = 0; this.seq = 0;
    this.wind = 0; this.box = null; this.fire = [false, false]; this.ghost = [false, false];
    this.eff = { big: [0, 0], slow: [0, 0] }; // hết hiệu lực lúc nào (theo this.T)
  }

  teamOf(id) { return this.teams[0].includes(id) ? 0 : this.teams[1].includes(id) ? 1 : -1; }
  start() { for (const p of this.api.players()) this.sendInit(p); }
  sendInit(p) {
    const team = this.teamOf(p.id);
    this.api.send(p, {
      t: 'init', team, teams: this.teams, map: this.map, points: this.points, items: this.itemsOn, ph: this.phase, picks: this.picks,
      tr: this.tr ? { ...this.tr, rt: this.rt, team: this.lastTeam, ghost: this.trGhost, id: this.seq } : null,
    });
  }

  onMsg(p, d) {
    const team = this.teamOf(p.id);
    if (team < 0) return;
    if (d.t === 'pick' && this.phase === 'pick') {
      const a = d.a | 0;
      if (a >= 0 && a < P.ANIMALS.length) { this.picks[p.id] = a; this.api.bcast({ t: 'picks', picks: this.picks }); }
      if (this.teams.flat().every(id => this.picks[id] != null)) this.time = Math.min(this.time, 1.2);
    } else if (d.t === 'p') {
      const lo = team === 0 ? 20 : P.NET_X + 20, hi = team === 0 ? P.NET_X - 20 : P.W - 20;
      this.pos[p.id] = [Math.max(lo, Math.min(hi, +d.x || 0)), Math.max(0, Math.min(400, +d.y || 0)), d.sw | 0];
    } else if (d.t === 'serve' && this.phase === 'serve' && this.server() === p.id) {
      this.doServe();
    } else if (d.t === 'hit') this.onHit(p, team, d);
  }

  server() { const t = this.teams[this.serveTeam]; return t[this.serveIdx[this.serveTeam] % t.length]; }

  toServe() {
    this.phase = 'serve'; this.time = SERVE_T; this.tr = null; this.rally = 0; this.lastTeam = -1;
    this.wind = this.map === 'beach' ? Math.round((Math.random() * 2 - 1) * 60) : 0;
    if (this.itemsOn && !this.box && Math.random() < .55) {
      const side = Math.random() < .5 ? -1 : 1;
      this.box = { x: Math.round(P.NET_X + side * (130 + Math.random() * 300)), y: Math.round(230 + Math.random() * 110) };
    }
  }

  doServe() {
    const id = this.server(), dir = this.serveTeam === 0 ? 1 : -1;
    const ps = this.pos[id] || [this.serveTeam === 0 ? 200 : 1000, 0];
    this.launch(P.aim('serve', ps[0] + dir * 26, 70, dir, this.picks[id], false, this.wind), this.serveTeam, id, 'serve');
    this.phase = 'rally';
  }

  launch(tr, team, by, kind) {
    const ghost = this.ghost[team] && kind !== 'serve';
    if (ghost) this.ghost[team] = false;
    if (kind !== 'serve') this.fire[team] = false;
    this.tr = tr; this.rt = 0; this.lastTeam = team; this.trGhost = ghost;
    if (kind !== 'serve') this.rally++;
    this.api.bcast({ t: 'traj', tr, team, by, kind, ghost, id: ++this.seq, rally: this.rally });
  }

  onHit(p, team, d) {
    const tr = this.tr;
    if (this.phase !== 'rally' || !tr || team === this.lastTeam) return;
    const te = +d.te;
    if (!(te >= 0) || te > this.rt + .6 || te > tr.tLand + .03) return;
    if (tr.netHit && te > tr.tNet) return;
    const s = P.pos(tr, te);
    if (team === 0 ? s.x > P.NET_X + 30 : s.x < P.NET_X - 30) return;
    const an = P.ANIMALS[this.picks[p.id]] || P.ANIMALS[0];
    const reach = P.BASE.reach * an.reach * (this.eff.big[team] > this.T ? 1.6 : 1);
    const px = +d.x, py = +d.y;
    if (Math.hypot(s.x - px, s.y - (py + 90)) > reach * 2.4 + 70) return; // rộng tay, vì mỗi máy lệch nhau vài khung hình
    let kind = ['hit', 'lob', 'drop', 'smash'].includes(d.kind) ? d.kind : 'hit';
    if (kind === 'smash' && s.y < 165) kind = 'hit'; // đập cầu chỉ khi cầu còn cao
    this.launch(P.aim(kind, s.x, s.y, team === 0 ? 1 : -1, this.picks[p.id], this.fire[team], this.wind), team, p.id, kind);
  }

  givePoint(win, why, x) {
    const pts = this.rally >= HOT_RALLY ? 2 : 1;
    this.score[win] += pts;
    if (this.serveTeam !== win) { this.serveTeam = win; this.serveIdx[win]++; }
    const [a, b] = this.score, top = Math.max(a, b);
    const over = (top >= this.points && Math.abs(a - b) >= 2) || top >= this.points + 4;
    this.api.bcast({ t: 'pt', team: win, why, x: Math.round(x), pts, score: this.score, over });
    this.tr = null;
    this.phase = over ? 'over' : 'point'; this.time = over ? OVER_T : POINT_T;
    this.winner = win;
  }

  tick(dt) {
    this.T += dt;
    if (this.phase === 'pick') {
      this.time -= dt;
      if (this.time <= 0) {
        for (const id of this.teams.flat()) if (this.picks[id] == null) this.picks[id] = Math.random() * P.ANIMALS.length | 0;
        this.api.bcast({ t: 'picks', picks: this.picks, done: 1 });
        this.toServe();
      }
    } else if (this.phase === 'serve') {
      this.time -= dt;
      if (this.time <= 0) this.doServe();
    } else if (this.phase === 'rally') {
      this.rt += dt;
      const tr = this.tr, s = P.pos(tr, this.rt);
      // hộp quà: cầu bay qua là đội vừa đánh được quà
      if (this.box && Math.hypot(s.x - this.box.x, s.y - this.box.y) < 36) {
        const it = ITEMS[Math.random() * ITEMS.length | 0], tm = this.lastTeam;
        if (it === 'big') this.eff.big[tm] = this.T + BIG_T;
        if (it === 'slow') this.eff.slow[1 - tm] = this.T + SLOW_T;
        if (it === 'fire') this.fire[tm] = true;
        if (it === 'ghost') this.ghost[tm] = true;
        this.api.bcast({ t: 'item', team: tm, it, x: this.box.x, y: this.box.y });
        this.box = null;
      }
      if (this.rt > tr.tLand + GRACE) {
        const x = tr.xLand;
        const out = x < P.COURT[0] || x > P.COURT[1];
        const side = x < P.NET_X ? 0 : 1;
        this.givePoint(out ? 1 - this.lastTeam : 1 - side, tr.netHit ? 'net' : out ? 'out' : 'in', x);
      }
    } else if (this.phase === 'point') {
      this.time -= dt;
      if (this.time <= 0) this.toServe();
    } else if (this.phase === 'over') {
      this.time -= dt;
      if (this.time <= 0) return this.api.end(this.teams[this.winner]);
    }
    this.broadcast();
  }

  broadcast() {
    const left = v => Math.max(0, +(v - this.T).toFixed(1));
    this.api.bcast({
      t: 's', ph: this.phase, tm: +this.time.toFixed(1), sc: this.score, pos: this.pos, srv: this.phase === 'serve' ? this.server() : 0,
      rally: this.rally, wind: this.wind, box: this.box, fire: this.fire, ghost: this.ghost,
      big: this.eff.big.map(left), slow: this.eff.slow.map(left),
    });
  }

  onRejoin(p) { this.sendInit(p); }
  onLeave(p) { if (this.teamOf(p.id) >= 0) this.api.end([]); }
}

module.exports = { meta, create: api => new Badminton(api) };
