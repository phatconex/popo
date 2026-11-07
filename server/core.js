// Lõi nền tảng: phòng, người chơi, vào lại khi rớt mạng, biểu cảm, cài đặt game.
//
// Mỗi game là một module { meta, create(api) }. create() trả về một đối tượng có:
//   start()            — bắt đầu trận
//   tick(dt)           — gọi 20 lần/giây
//   onMsg(player, d)   — tin nhắn từ client (client gửi {t:'g', d})
//   onRejoin(player)   — người chơi vào lại sau khi rớt mạng: gửi lại trạng thái
//   onDisconnect(p)    — (tuỳ chọn) vừa rớt mạng, còn giữ chỗ
//   onLeave(player)    — rời hẳn
// api cho game: settings, players(), send(p, d), bcast(d), end(winnerIds)
const crypto = require('crypto');

const RECONNECT_MS = 30000;
const MAX_PLAYERS = 12;
const EMOTES = 8;
const AVATARS = 24; // xem public/core3d/animals.js

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

class Core {
  // opts.lagMs: test switch — every message in either direction is delayed lagMs / 2 (order preserved).
  constructor(games, opts = {}) {
    this.games = games;
    this.lagMs = Math.max(0, +opts.lagMs || 0);
    this.rooms = new Map();
    this.nextId = 1;
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const r of this.rooms.values()) if (r.game) r.game.tick(dt);
    }, 50);
  }

  connect(ws) {
    const conn = { ws, p: null };
    const half = this.lagMs / 2;
    if (half > 0) { // equal timeouts fire in order, so ordering survives
      const raw = ws.send;
      ws.send = (...a) => { setTimeout(() => { if (ws.readyState === 1) raw.apply(ws, a); }, half); };
    }
    send(ws, { t: 'welcome', games: Object.values(this.games).map(g => g.meta) });
    ws.on('message', buf => {
      let m;
      try { m = JSON.parse(buf); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (half > 0) setTimeout(() => this.onMsg(conn, m), half); else this.onMsg(conn, m);
    });
    ws.on('close', () => { if (half > 0) setTimeout(() => this.onClose(conn), half); else this.onClose(conn); });
  }

  close() { clearInterval(this.timer); }

  makeCode() {
    let c;
    do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (this.rooms.has(c));
    return c;
  }
  defaults(gameId) {
    const s = {};
    for (const o of this.games[gameId].meta.settings || []) s[o.key] = o.def;
    return s;
  }
  lobbyMsg(r) {
    return {
      t: 'lobby', code: r.code, host: r.host, state: r.game ? 'playing' : 'lobby', game: r.gameId, settings: r.settings,
      players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, av: p.av, on: p.connected, wins: p.wins, ready: !!p.ready, team: p.team })),
    };
  }
  bcast(r, o) {
    const s = JSON.stringify(o);
    for (const p of r.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  sync(r) { this.bcast(r, this.lobbyMsg(r)); }

  attach(conn, p) {
    const oldWs = p.ws;
    conn.p = p;
    p.ws = conn.ws;
    p.connected = true;
    clearTimeout(p.dropTimer);
    if (oldWs && oldWs !== conn.ws) try { oldWs.close(); } catch {}
    send(p.ws, { t: 'joined', id: p.id, token: p.token, code: p.room.code });
  }

  onMsg(conn, m) {
    const p = conn.p, r = p && p.room;
    switch (m.t) {
      case 'join': {
        if (p) return;
        const name = String(m.name || '').trim().slice(0, 14) || 'Player';
        const av = Math.abs(m.av | 0) % AVATARS;
        let room;
        if (m.code) {
          room = this.rooms.get(String(m.code).trim().toUpperCase());
          if (!room) return send(conn.ws, { t: 'err', msg: 'Room not found' });
          if (room.game) return send(conn.ws, { t: 'err', msg: 'This room is already playing — wait for the next game' });
          if (room.players.size >= MAX_PLAYERS) return send(conn.ws, { t: 'err', msg: 'Room is full' });
        } else {
          const gameId = this.games[m.game] ? m.game : Object.keys(this.games)[0];
          room = { code: this.makeCode(), players: new Map(), host: null, game: null, gameId, settings: this.defaults(gameId) };
          this.rooms.set(room.code, room);
        }
        const np = { id: this.nextId++, token: crypto.randomBytes(12).toString('hex'), name, av, room, wins: 0, emoteAt: 0, ready: false, team: -1 };
        room.players.set(np.id, np);
        if (!room.host) room.host = np.id;
        this.attach(conn, np);
        this.sync(room);
        break;
      }
      case 'rejoin': {
        if (p) return;
        const room = this.rooms.get(String(m.code || '').toUpperCase());
        const old = room && [...room.players.values()].find(q => q.token === m.token);
        if (!old) return send(conn.ws, { t: 'rejoin_fail' });
        this.attach(conn, old);
        this.sync(room);
        if (room.game) room.game.onRejoin(old);
        break;
      }
      case 'profile':
        if (!r || r.game) return;
        if (m.name) p.name = String(m.name).trim().slice(0, 14) || p.name;
        if (m.av != null) p.av = Math.abs(m.av | 0) % AVATARS;
        if (m.ready != null) p.ready = !!m.ready;
        if (Number.isInteger(m.team)) {
          const T = this.games[r.gameId].meta.teams, t = m.team;
          if (T && (t === -1 || (t >= 0 && t < T.count && [...r.players.values()].filter(q => q !== p && q.team === t).length < T.max))) p.team = t;
        }
        this.sync(r);
        break;
      case 'settings': {
        if (!r || r.host !== p.id || r.game) return;
        if (m.game && this.games[m.game] && m.game !== r.gameId) { r.gameId = m.game; r.settings = this.defaults(m.game); for (const q of r.players.values()) q.team = -1; }
        const opts = this.games[r.gameId].meta.settings || [];
        if (m.settings) for (const o of opts) if (o.options.some(x => x.v === m.settings[o.key])) r.settings[o.key] = m.settings[o.key];
        this.sync(r);
        break;
      }
      case 'start': {
        if (!r || r.host !== p.id || r.game) return;
        const g = this.games[r.gameId];
        const n = [...r.players.values()].filter(q => q.connected).length;
        if (n < g.meta.min) return send(conn.ws, { t: 'err', msg: `Need at least ${g.meta.min} players` });
        if (n > g.meta.max) return send(conn.ws, { t: 'err', msg: `Max ${g.meta.max} players for this game` });
        r.game = g.create(this.api(r));
        this.sync(r);
        r.game.start();
        break;
      }
      case 'emote': {
        if (!r) return;
        const now = Date.now();
        if (now - p.emoteAt < 700) return;
        p.emoteAt = now;
        this.bcast(r, { t: 'emote', id: p.id, e: Math.abs(m.e | 0) % EMOTES });
        break;
      }
      case 'leave':
        if (p) { conn.p = null; this.remove(p); }
        break;
      case 'g':
        if (r && r.game && m.d && typeof m.d === 'object') r.game.onMsg(p, m.d);
        break;
    }
  }

  onClose(conn) {
    const p = conn.p;
    if (!p || p.ws !== conn.ws) return;
    p.ws = null;
    p.connected = false;
    const r = p.room;
    if (!r.players.has(p.id)) return;
    if (r.game && r.game.onDisconnect) r.game.onDisconnect(p);
    this.sync(r);
    p.dropTimer = setTimeout(() => this.remove(p), RECONNECT_MS);
  }

  remove(p) {
    const r = p.room;
    clearTimeout(p.dropTimer);
    if (!r.players.has(p.id)) return;
    r.players.delete(p.id);
    if (r.game) r.game.onLeave(p);
    if (!r.players.size) { r.game = null; this.rooms.delete(r.code); return; }
    if (r.host === p.id) r.host = ([...r.players.values()].find(q => q.connected) || r.players.values().next().value).id;
    this.sync(r);
  }

  api(r) {
    const core = this;
    return {
      settings: { ...r.settings },
      players: () => [...r.players.values()],
      send: (p, d) => send(p.ws, { t: 'g', d }),
      bcast: d => core.bcast(r, { t: 'g', d }),
      end: (winners = []) => {
        if (!r.game) return;
        r.game = null;
        for (const id of winners) { const q = r.players.get(id); if (q) q.wins++; }
        for (const q of r.players.values()) q.ready = false;
        core.sync(r);
      },
    };
  }
}

module.exports = Core;
