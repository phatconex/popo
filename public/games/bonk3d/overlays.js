// Bonk Island overlays (spec §2.3, §2.5, §5.1): the 3-2-1-BONK! count, big words (SPLASH!, YOU WIN!, DRAW!) and the
// round results card. The final podium is core3d/podium.js. Everything is decoration: no pointer events.
import { h, esc } from '../../core3d/ui.js';

export class Overlays {
  constructor(L, { sfx }) {
    this.L = L; this.sfx = sfx; this.last = null; this.resEl = null;
    this.big$ = h('<div class="bk-big o"></div>');
    L.appendChild(this.big$);
  }

  // Called every frame with the round clock: 3, 2, 1 while c < 0, BONK! when it reaches 0. Never fires after a
  // mid-round join (the count was missed). reset() before a new round.
  count(c) {
    if (!Number.isFinite(c)) return;
    let n = null;
    if (c < 0) n = Math.min(3, Math.ceil(-c));
    else if (this.last > 0 && c < 2) n = 0;
    if (n === null) { if (c >= 2) this.last = 0; return; }
    if (n === this.last) return;
    this.last = n;
    if (n) { this.big(String(n), 700); this.sfx.tick(); } else { this.big('BONK!', 800); this.sfx.go(); }
  }
  reset() { this.last = null; this.closeResults(); this.big$.classList.remove('bk-on'); clearTimeout(this.bigT); }

  // Big centred words; html may contain <small>.
  big(html, ms) {
    const b = this.big$;
    clearTimeout(this.bigT);
    b.classList.remove('bk-on'); void b.offsetWidth; // restart the pop-in
    b.innerHTML = html; b.classList.add('bk-on');
    this.bigT = setTimeout(() => b.classList.remove('bk-on'), ms);
  }

  // rows: [{ id, place, ko, got, total }] (roundEnd); players: [{ id, name, color }]
  results(rows, players, myId, rd, of) {
    this.closeResults();
    const by = new Map(players.map(p => [p.id, p]));
    const order = [...rows].sort((a, b) => (a.place || 99) - (b.place || 99));
    const body = order.map(r => {
      const p = by.get(r.id) || { name: 'Player', color: '#8c96a8' };
      return `<div class="bk-row${r.id === myId ? ' bk-me' : ''}${r.place === 1 ? ' bk-first' : ''}"><b class="bk-pl">${r.place || '-'}</b><i style="background:${p.color}"></i><span>${esc(p.name)}</span><span class="bk-k">${r.ko | 0}</span><span class="bk-p">+${r.got | 0}</span><span class="bk-t">${r.total | 0}</span></div>`;
    }).join('');
    this.resEl = h(`<div class="bk-res"><div class="chip bk-card"><div class="bk-hd o">${of && rd >= of ? 'Final round results' : `Round ${rd} results`}</div><div class="bk-rows"><div class="bk-row bk-h"><span>#</span><span></span><span>Player</span><span class="bk-k">KOs</span><span class="bk-p">Points</span><span class="bk-t">Total</span></div>${body}</div><div class="bk-note">Points: last paw standing 5 · 2nd 3 · 3rd 2 · 4th 1 · +1 for every knock-out</div></div></div>`);
    this.L.appendChild(this.resEl);
  }
  closeResults() { if (this.resEl) this.resEl.remove(); this.resEl = null; }

  dispose() { clearTimeout(this.bigT); this.closeResults(); this.big$.remove(); }
}
