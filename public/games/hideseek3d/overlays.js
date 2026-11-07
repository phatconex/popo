// Get Ready card, seeker countdown, 3-2-1-GO, round results, final podium.
import { h, esc, PCOL } from '../../core3d/ui.js';
import { thumb } from '../../core3d/assets.js';
import { podium } from '../../core3d/podium.js';

const MAP_NAME = { farm: 'Farm', snow: 'Snow Village', beach: 'Beach' };

export class Overlays {
  constructor(L, { sfx, isTouch }) {
    this.L = L; this.sfx = sfx; this.isTouch = isTouch; this.lastCount = null;
    L.insertAdjacentHTML('beforeend', '<div class="hs-dim o"></div><div class="chip hs-hide"></div><div class="hs-card"></div><div class="hs-count o"></div>');
    this.$ = s => L.querySelector(s);
  }

  roleCard(role, round, total, theme) {
    const c = this.$('.hs-card');
    const tips = role === 'hider'
      ? (this.isTouch ? ['Stick: walk slowly like the herd', 'Hold Run to dash — it leaves footprints', 'Call: −3 s on the clock, but the seeker sees where · Decoy: a look-alike runs off'] : ['WASD: walk slowly like the herd', 'Shift: run — it leaves footprints!', 'Q call: −3 s, but the seeker sees where · F decoy'])
      : (this.isTouch ? ['Stick: move · Tap the ground to squirt water', 'Real animals cost you water', 'Listen: a red wave = a hider is near'] : ['WASD: move · Click to squirt water', 'Real animals cost you water', 'R listen: a red wave = a hider is near']);
    c.innerHTML = `<div class="rnd">ROUND ${round} / ${total} · ${(MAP_NAME[theme] || '').toUpperCase()}</div><div class="you">You are ${role === 'hider' ? 'a' : 'the'}</div>
      <div class="role" style="color:${role === 'hider' ? '#55d36b' : '#ff5d6c'}">${role === 'hider' ? 'HIDER' : 'SEEKER'}</div><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
    c.classList.add('on');
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => c.classList.remove('on'), 3600);
  }

  // called with every snapshot
  phase(s) {
    const hiding = s.ph === 'hiding', seeker = s.me.role === 'seeker';
    const dim = this.$('.hs-dim'), hide = this.$('.hs-hide');
    const cardOn = this.$('.hs-card').classList.contains('on');
    dim.style.display = hiding && seeker && !cardOn ? 'flex' : 'none';
    if (hiding && seeker) dim.innerHTML = `Seeker is counting…<big>${s.tm}</big><span style="font-size:18px">The hiders are sneaking away!</span>`;
    hide.style.display = hiding && !seeker && !cardOn && s.tm > 3 ? 'block' : 'none';
    if (hiding && !seeker) hide.textContent = 'Find a hiding spot!';
    // 3-2-1-GO at the end of the hiding phase
    let n = null;
    if (hiding && s.tm <= 3 && s.tm >= 1) n = s.tm;
    if (!hiding && this.lastPh === 'hiding') n = 0;
    this.lastPh = s.ph;
    if (n !== null && n !== this.lastCount) {
      this.lastCount = n;
      this.$('.hs-count').innerHTML = n ? `<span>${n}</span>` : '<span class="go">GO!</span>';
      n ? this.sfx.tick() : this.sfx.go();
      clearTimeout(this.countT); this.countT = setTimeout(() => { this.$('.hs-count').innerHTML = ''; }, 1000);
    }
    if (!hiding && n === null) this.lastCount = null;
  }

  // Round results. players: lobby players (for colours).
  round(d, players, myId, onNext) {
    this.closeRound();
    const color = id => PCOL[Math.max(0, players.findIndex(p => p.id === id)) % PCOL.length];
    const title = d.winner === 'seeker' ? 'Seeker wins!' : 'Hiders win!';
    const avOf = r => r.role === 'seeker' ? ((players.find(p => p.id === r.id) || {}).av | 0) : (r.skin | 0);
    const rows = d.rows.map((r, i) => `<tr class="${i === 0 ? 'top' : ''}" style="animation-delay:${.15 + i * .08}s"><td style="background:${color(r.id)}"></td><td><img class="av" data-av="${avOf(r)}" alt="">${esc(r.name)}${r.id === myId ? ' (you)' : ''}<span class="tag" style="background:${r.role === 'seeker' ? '#ff5d6c' : '#55d36b'}">${r.role === 'seeker' ? 'SEEKER' : r.alive ? 'SURVIVED' : 'CAUGHT'}</span></td><td><span class="pts" data-to="${r.pts}">+0</span> · <span data-to="${r.score}" data-from="${r.score - r.pts}">${r.score - r.pts}</span></td></tr>`).join('');
    const el = h(`<div class="hs-res"><div class="box"><h2>${title}</h2><div class="sub">ROUND ${d.round} / ${d.total}</div><table>${rows}</table><div class="next"></div></div></div>`);
    this.L.appendChild(el); this.resEl = el;
    el.querySelectorAll('img.av').forEach(img => thumb(+img.dataset.av).then(u => { img.src = u; }));
    const t0 = performance.now() + 450, nums = [...el.querySelectorAll('[data-to]')];
    const count = () => { const k = Math.min(1, Math.max(0, (performance.now() - t0) / 800)), e = 1 - (1 - k) ** 3; for (const n of nums) { const a = +(n.dataset.from || 0), b = +n.dataset.to, v = Math.round(a + (b - a) * e); n.textContent = n.classList.contains('pts') ? '+' + v : v; } if (k < 1 && this.resEl === el) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    let left = Math.round(d.wait);
    const tick = () => { el.querySelector('.next').textContent = d.last ? `Final results in ${Math.max(0, left - 6)}s…` : `Next round in ${left}s…`; left--; };
    tick(); this.resT = setInterval(tick, 1000);
    if (d.last) this.finalT = setTimeout(() => { this.closeRound(); onNext && onNext(); }, 3500);
  }
  closeRound() { clearInterval(this.resT); clearTimeout(this.finalT); if (this.resEl) this.resEl.remove(); this.resEl = null; }

  // Final podium (shared scene, core3d/podium.js). Returns { scene, tick(dt,t), dispose() }.
  podium(d, players, myId, engine) {
    return podium({ layer: this.L, engine, sfx: this.sfx, rows: d.rows.map(r => ({ id: r.id, name: r.name, score: r.score })), players, myId });
  }
}
