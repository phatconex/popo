// Blind Drive - game module. Pure rules live here; the room class is filled in by a later task.
const { CAR } = require('../../../public/games/blinddrive3d/shared.js');

const PLACE_PTS = [300, 200, 120, 60];
const PTS_PICKED = 100, PTS_COIN = 10;

const meta = {
  id: 'blinddrive',
  name: 'Blind Drive',
  desc: 'One drives blind, one calls the turns',
  tag: '2-8 players · teams',
  min: 2, max: 8,
  teams: { count: 4, max: 3, names: ['Red', 'Blue', 'Green', 'Yellow'] },
  settings: [
    { key: 'map', label: 'Map', def: 'random', options: [{ v: 'random', label: 'Random' }, { v: 'country', label: 'Country Road' }, { v: 'snow', label: 'Snowy Pass' }, { v: 'beach', label: 'Beach Town' }, { v: 'night', label: 'Night City' }] },
    { key: 'levels', label: 'Levels', def: 4, options: [{ v: 2, label: '2' }, { v: 4, label: '4' }, { v: 6, label: '6' }] },
    { key: 'delay', label: 'Signal delay', def: 0, options: [{ v: 0, label: 'None' }, { v: .5, label: '0.5 s' }, { v: 1, label: '1 s' }] },
  ],
};

// Split players into `count` groups of 2..max. Players are in join order; result ids are in join order.
function balance(players, count = 4, max = 3) {
  const order = new Map(players.map((p, i) => [p.id, i]));
  const groups = Array.from({ length: count }, () => []);
  const free = [];
  for (const p of players) {
    const t = p.team;
    if (Number.isInteger(t) && t >= 0 && t < count && groups[t].length < max) groups[t].push(p.id);
    else free.push(p.id);
  }
  // place unassigned players
  for (let i = 0; i < free.length; i++) {
    const id = free[i], left = free.length - i;
    let g = groups.find(x => x.length === 1);
    if (!g && left >= 2) g = groups.find(x => x.length === 0);
    if (!g) {
      const open = groups.filter(x => x.length > 0 && x.length < max);
      if (open.length) g = open.reduce((a, b) => (b.length < a.length ? b : a));
    }
    if (!g) g = groups.find(x => x.length < max);
    g.push(id);
  }
  // fix singles
  const singles = groups.filter(x => x.length === 1);
  for (let i = 0; i + 1 < singles.length; i += 2) singles[i].push(singles[i + 1].pop());
  if (singles.length % 2) {
    const s = singles[singles.length - 1];
    const two = groups.find(x => x.length === 2);
    if (two) two.push(s.pop());
    else {
      const three = groups.find(x => x.length === 3);
      if (three) {
        let li = 0;
        three.forEach((id, k) => { if (order.get(id) > order.get(three[li])) li = k; });
        s.push(three.splice(li, 1)[0]);
      }
    }
  }
  for (const g of groups) g.sort((a, b) => order.get(a) - order.get(b));
  return groups;
}

// Points for one level: finishing place (1-based or null), picked-up passengers, coins.
function score({ place, picked, coins }) {
  return (PLACE_PTS[place - 1] || 0) + picked * PTS_PICKED + coins * PTS_COIN;
}

// Sort best first; equal total and firsts share the same rank (1, 1, 3).
function rank(rows) {
  const s = rows.slice().sort((a, b) => b.total - a.total || b.firsts - a.firsts || a.team - b.team);
  let r = 0;
  return s.map((row, i) => {
    if (i === 0 || row.total !== s[i - 1].total || row.firsts !== s[i - 1].firsts) r = i + 1;
    return { ...row, rank: r };
  });
}

const fin = v => typeof v === 'number' && Number.isFinite(v);
function validateMove(prev, next, now) {
  if (!next || typeof next !== 'object' || !fin(next.x) || !fin(next.z)) return false;
  if (!prev) return true;
  const dt = Math.max(.05, now - prev.t);
  return Math.hypot(next.x - prev.x, next.z - prev.z) <= CAR.VMAX * dt * 1.5 + .5;
}

class BlindDrive {
  constructor(api) { this.api = api; }
  start() {}
  tick() {}
  onMsg() {}
  onRejoin() {}
  onDisconnect() {}
  onLeave() {}
}

module.exports = { meta, create: api => new BlindDrive(api), _test: { balance, score, rank, validateMove, PLACE_PTS } };
