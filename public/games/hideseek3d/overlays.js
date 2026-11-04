// Get Ready card, seeker countdown, 3-2-1-GO, round results, final podium.
import * as THREE from 'three';
import { h, esc, PCOL } from '../../core3d/ui.js';
import { island } from '../../core3d/screens/island.js';
import { pet, ANIMALS } from '../../core3d/assets.js';

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
      ? (this.isTouch ? ['Stick: walk slowly like the herd', 'Hold Run to dash — it leaves footprints', 'Swap · Call · Sleep · Decoy to fool the seeker'] : ['WASD: walk slowly like the herd', 'Shift: run — it leaves footprints!', 'E swap · Q call · Z sleep · F decoy'])
      : (this.isTouch ? ['Stick: move · Tap the ground to squirt water', 'Real animals cost you water', 'Listen tells you if a hider is close'] : ['WASD: move · Click to squirt water', 'Real animals cost you water', 'R: listen for hiders nearby']);
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
    hide.style.display = hiding && !seeker && !cardOn ? 'block' : 'none';
    if (hiding && !seeker) hide.textContent = `Find a hiding spot! ${s.tm}`;
    // 3-2-1-GO at the end of the hiding phase
    let n = null;
    if (hiding && s.tm <= 3 && s.tm >= 1) n = s.tm;
    if (!hiding && this.lastPh === 'hiding') n = 0;
    this.lastPh = s.ph;
    if (n !== null && n !== this.lastCount) {
      this.lastCount = n;
      this.$('.hs-count').innerHTML = n ? `<span>${n}</span>` : '<span class="go">GO!</span>';
      n ? this.sfx.tick() : this.sfx.go();
    }
    if (!hiding && n === null) this.lastCount = null;
  }

  // Round results. players: lobby players (for colours).
  round(d, players, myId, onNext) {
    this.closeRound();
    const color = id => PCOL[Math.max(0, players.findIndex(p => p.id === id)) % PCOL.length];
    const title = d.winner === 'seeker' ? 'Seeker wins!' : 'Hiders win!';
    const rows = d.rows.map(r => `<tr><td style="background:${color(r.id)}"></td><td>${esc(r.name)}${r.id === myId ? ' (you)' : ''}<span class="tag" style="background:${r.role === 'seeker' ? '#ff5d6c' : '#55d36b'}">${r.role === 'seeker' ? 'SEEKER' : r.alive ? 'SURVIVED' : 'CAUGHT'}</span></td><td><span class="pts">+${r.pts}</span> · ${r.score}</td></tr>`).join('');
    const el = h(`<div class="hs-res"><div class="box"><h2>${title}</h2><div class="sub">ROUND ${d.round} / ${d.total}</div><table>${rows}</table><div class="next"></div></div></div>`);
    this.L.appendChild(el); this.resEl = el;
    let left = Math.round(d.wait);
    const tick = () => { el.querySelector('.next').textContent = d.last ? `Final results in ${Math.max(0, left - 6)}s…` : `Next round in ${left}s…`; left--; };
    tick(); this.resT = setInterval(tick, 1000);
    if (d.last) setTimeout(() => { this.closeRound(); onNext && onNext(); }, 3500);
  }
  closeRound() { clearInterval(this.resT); if (this.resEl) this.resEl.remove(); this.resEl = null; }

  // Final podium in its own little scene. Returns { scene, tick(dt,t), dispose() }.
  async podium(d, players, myId, engine, onBack) {
    const scene = await island({ radius: 9, trees: 16, ring: [6.5, 8.5], arc: [Math.PI * 1.05, Math.PI * 1.95], seed: 3 });
    const top = [...d.rows].sort((a, b) => b.score - a.score);
    const avOf = id => (players.find(p => p.id === id) || {}).av | 0;
    const colorOf = id => PCOL[Math.max(0, players.findIndex(p => p.id === id)) % PCOL.length];
    const spots = [[0, 1.6], [-2.2, 1.1], [2.2, .7]], pets = [];
    for (let i = 0; i < Math.min(3, top.length); i++) {
      const r = top[i], [x, hgt] = spots[i];
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.9, hgt, 1.9), new THREE.MeshStandardMaterial({ color: colorOf(r.id), roughness: .6 }));
      block.position.set(x, hgt / 2, 0); block.castShadow = block.receiveShadow = engine.quality.shadows; scene.add(block);
      const p = await pet(avOf(r.id), 1.2); p.root.position.set(x, hgt, 0); p.play(i === 0 ? 'dance' : 'gesture-positive'); scene.add(p.root); pets.push(p);
      if (i === 0) {
        const crown = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: .3, roughness: .4 });
        const band = new THREE.Mesh(new THREE.CylinderGeometry(.32, .3, .18, 16, 1, true), gold); crown.add(band);
        for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(.08, .22, 6), gold); const a = k / 5 * 6.28; sp.position.set(Math.cos(a) * .3, .18, Math.sin(a) * .3); crown.add(sp); }
        crown.position.set(x, hgt + 1.45, 0); scene.add(crown); this.crown = crown;
      }
    }
    const L = h(`<div class="hs-podium"><h2>${esc(top[0] ? top[0].name : '')} wins!</h2><div class="rest">${top.map((r, i) => `<span class="chip">${i + 1}. ${esc(r.name)}${r.id === myId ? ' (you)' : ''} · ${r.score}</span>`).join('')}</div></div>`);
    this.L.appendChild(L);
    const back = h('<div class="chip hs-back" style="padding:6px 16px 8px;font-size:18px">Back to the lobby in a moment…</div>'); this.L.appendChild(back);
    this.sfx.win();
    const conf = [];
    return {
      scene, conf,
      tick: (dt, t) => {
        for (const p of pets) p.mixer.update(dt);
        if (this.crown) { this.crown.rotation.y += dt * 1.5; this.crown.position.y += Math.sin(t * 3) * .002; }
        const cam = engine.camera, portrait = cam.aspect < .9;
        cam.position.set(Math.sin(t * .2) * 1.2, portrait ? 4.5 : 3.6, portrait ? 13 : 9); cam.lookAt(0, portrait ? 1.6 : 1.5, 0);
      },
      dispose: () => { for (const p of pets) p.dispose(); L.remove(); back.remove(); },
    };
  }
}
