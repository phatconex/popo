// Blind Drive overlays: Get Ready card, 3-2-1-GO, finish banner, level results, final podium.
import * as THREE from 'three';
import { h, esc } from '../../core3d/ui.js';
import { island } from '../../core3d/screens/island.js';
import { pet } from '../../core3d/assets.js';
import { TEAM_COL } from './car.js';

const MAP_NAME = { country: 'Country Road', snow: 'Snowy Pass', beach: 'Beach Town', night: 'Night City' };
const PLACE = ['1st', '2nd', '3rd', '4th'];
const STEP_H = [1.6, 1.1, .7];
const colOf = id => TEAM_COL[id] || TEAM_COL[0];

export class Overlays {
  constructor(L, { sfx, isTouch }) {
    this.L = L; this.sfx = sfx; this.isTouch = isTouch;
    this.lastCount = null; this.lastPh = ''; this.teams = []; this.me = { team: -1, role: 'nav' };
    L.insertAdjacentHTML('beforeend', '<div class="bd-ready"></div><div class="bd-count"></div><div class="bd-banner"></div>');
    this.$ = s => L.querySelector(s);
  }

  // teams: [{id, name, driver, callers}] with names already resolved; me: {team, role}
  getReady(level, levels, themeName, teams, me) {
    this.teams = teams; this.me = me || this.me;
    const rows = teams.map(t => `<div class="tm${t.id === this.me.team ? ' mine' : ''}" style="--c:${colOf(t.id)}"><i></i><div><b>${esc(t.name)}</b>
      <span>Drives: ${esc(t.driver || '?')}</span>${t.callers.length ? `<span>Calls: ${t.callers.map(esc).join(', ')}</span>` : ''}</div></div>`).join('');
    const you = this.me.role === 'driver' ? 'You drive!' : this.me.role === 'solo' ? 'You drive on your own!' : this.me.team >= 0 ? 'You call the turns!' : 'You are watching';
    const c = this.$('.bd-ready');
    c.innerHTML = `<div class="rnd">${esc((MAP_NAME[themeName] || themeName || '').toUpperCase())} · LEVEL ${level} / ${levels}</div>
      <div class="role r-${this.me.role}">${you}</div><div class="tms">${rows}</div>`;
    c.classList.add('on');
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => c.classList.remove('on'), 4500);
  }

  // Call with every snapshot: card off after ready, 3-2-1 during count, GO at race start, result countdown.
  phase(s) {
    if (s.ph !== 'ready') this.$('.bd-ready').classList.remove('on');
    let n = null;
    if (s.ph === 'count' && s.tm >= 1 && s.tm <= 3) n = s.tm;
    if (s.ph === 'race' && this.lastPh === 'count') n = 0;
    this.lastPh = s.ph;
    if (n !== null) this.countdown(n);
    else if (s.ph !== 'count') this.lastCount = null;
    const nx = this.$('.bd-res .next');
    if (nx && s.ph === 'result') nx.textContent = this.last ? `Final results in ${s.tm}s...` : `Next level in ${s.tm}s...`;
  }

  countdown(n) {
    if (n === this.lastCount) return;
    this.lastCount = n;
    const el = this.$('.bd-count');
    el.innerHTML = n ? `<span>${n}</span>` : '<span class="go">GO!</span>';
    n ? this.sfx.tick() : this.sfx.go();
    clearTimeout(this.countT);
    this.countT = setTimeout(() => { el.innerHTML = ''; }, 1000);
  }

  finishBanner(place) {
    const el = this.$('.bd-banner');
    el.innerHTML = `<span class="p${place}">${PLACE[place - 1] || place + 'th'}!</span>`;
    place === 1 ? this.sfx.win() : this.sfx.pop();
    clearTimeout(this.banT);
    this.banT = setTimeout(() => { el.innerHTML = ''; }, 2600);
  }

  // rows: [{team, place, picked, coins, points, total}]; last: final level (the podium follows)
  levelResults(rows, level, levels) {
    this.closeResults();
    this.last = level === levels;
    const ord = [...rows].sort((a, b) => (a.place || 99) - (b.place || 99));
    const name = id => (this.teams.find(t => t.id === id) || {}).name || ['Red', 'Blue', 'Green', 'Yellow'][id] || 'Team';
    const body = ord.map((r, i) => `<tr class="${r.team === this.me.team ? 'mine' : ''}" style="animation-delay:${.1 + i * .08}s;--c:${colOf(r.team)}">
      <td class="sw"></td><td class="nm">${esc(name(r.team))}${r.team === this.me.team ? ' (you)' : ''}</td><td>${r.place ? PLACE[r.place - 1] || r.place + 'th' : 'DNF'}</td>
      <td>${r.picked}</td><td>${r.coins}</td><td class="pts">+${r.points}</td><td class="tot">${r.total}</td></tr>`).join('');
    const el = h(`<div class="bd-res"><div class="box"><h2>Level ${level} results</h2>
      <table><tr class="hd"><th></th><th>Team</th><th>Place</th><th>Riders</th><th>Coins</th><th>Points</th><th>Total</th></tr>${body}</table><div class="next"></div></div></div>`);
    this.L.appendChild(el); this.resEl = el;
  }
  closeResults() { if (this.resEl) this.resEl.remove(); this.resEl = null; }

  // Everything but the podium: next level started or the lobby is back.
  close() {
    clearTimeout(this.cardT); clearTimeout(this.countT); clearTimeout(this.banT);
    this.$('.bd-ready').classList.remove('on');
    this.$('.bd-count').innerHTML = ''; this.$('.bd-banner').innerHTML = '';
    this.lastCount = null; this.lastPh = '';
    this.closeResults();
  }

  // Final podium in its own little scene. rows: `final` rows ({team, total, rank, members}).
  // Returns { scene, tick(dt, t), dispose() }. `players` come from the lobby (id, name, av).
  async podium(rows, { players, engine, alive = () => true }) {
    this.close();
    const scene = await island({ radius: 11, trees: 16, ring: [8.5, 10.5], arc: [Math.PI * 1.05, Math.PI * 1.95], seed: 3 });
    const name = id => (this.teams.find(t => t.id === id) || {}).name || ['Red', 'Blue', 'Green', 'Yellow'][id] || 'Team';
    const avOf = id => (players.find(p => p.id === id) || {}).av | 0;
    const top = rows.slice(0, 3), pets = [], spots = [0, -3.2, 3.2];
    for (let i = 0; i < top.length; i++) {
      const r = top[i], x = spots[i], hgt = STEP_H[Math.min(3, r.rank || i + 1) - 1];
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.8, hgt, 1.9), new THREE.MeshStandardMaterial({ color: colOf(r.team), roughness: .6 }));
      block.position.set(x, hgt / 2, 0); block.castShadow = block.receiveShadow = engine.quality.shadows; scene.add(block);
      const mem = r.members || [], n = mem.length;
      const ps = await Promise.all(mem.map(id => pet(avOf(id), n > 2 ? .8 : .95)));
      ps.forEach((p, k) => {
        p.root.position.set(x + (k - (n - 1) / 2) * .85, hgt, 0); p.play('dance'); scene.add(p.root); pets.push(p);
      });
    }
    if (!alive()) { pets.forEach(p => p.dispose()); return null; }
    const winners = rows.filter(r => r.rank === 1 && r.total > 0).map(r => name(r.team));
    const title = !winners.length ? 'No winner this time' : winners.length === 1 ? `${winners[0]} team wins!` : `${winners.join(' and ')} win!`;
    const L = h(`<div class="bd-podium"><h2>${esc(title)}</h2><div class="rest">${rows.map(r => `<span class="chip${r.team === this.me.team ? ' mine' : ''}"><i style="background:${colOf(r.team)}"></i>${r.rank}. ${esc(name(r.team))} · ${r.total}</span>`).join('')}</div></div>`);
    this.L.appendChild(L);
    const back = h('<div class="chip bd-back" style="padding:6px 16px 8px;font-size:18px">Back to the lobby in a moment...</div>'); this.L.appendChild(back);
    this.sfx.win();
    return {
      scene,
      tick: (dt, t) => {
        for (const p of pets) p.mixer.update(dt);
        // keep all three steps in view: distance from the horizontal field of view
        const cam = engine.camera, half = Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect), dist = Math.max(11, 5.1 / Math.tan(half));
        cam.position.set(Math.sin(t * .2) * 1.2, 3.6 + (dist - 11) * .35, dist); cam.lookAt(0, 1.4 + (dist - 11) * .12, 0);
      },
      dispose: () => { for (const p of pets) p.dispose(); L.remove(); back.remove(); },
    };
  }
}
