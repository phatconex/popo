// Shared final podium: the top three on blocks in their own little island scene (Hide & Seek, Bonk Island).
// rows: [{ id, name, score }]; players: lobby players (for animals and colours). Appends its text to `layer`.
// Returns { scene, tick(dt, t), dispose() }; the caller swaps the engine scene and ticks it every frame.
import * as THREE from 'three';
import { h, esc, PCOL } from './ui.js';
import { island } from './screens/island.js';
import { pet } from './assets.js';

export async function podium({ layer, engine, sfx, rows, players, myId }) {
  const scene = await island({ radius: 9, trees: 16, ring: [6.5, 8.5], arc: [Math.PI * 1.05, Math.PI * 1.95], seed: 3 });
  const top = [...rows].sort((a, b) => b.score - a.score);
  const avOf = id => (players.find(p => p.id === id) || {}).av | 0;
  const colorOf = id => PCOL[Math.max(0, players.findIndex(p => p.id === id)) % PCOL.length];
  const spots = [[0, 1.6], [-2.2, 1.1], [2.2, .7]], pets = [];
  let crown = null;
  for (let i = 0; i < Math.min(3, top.length); i++) {
    const r = top[i], [x, hgt] = spots[i];
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.9, hgt, 1.9), new THREE.MeshStandardMaterial({ color: colorOf(r.id), roughness: .6 }));
    block.position.set(x, hgt / 2, 0); block.castShadow = block.receiveShadow = engine.quality.shadows; scene.add(block);
    const p = await pet(avOf(r.id), 1.2); p.root.position.set(x, hgt, 0); p.play(i === 0 ? 'dance' : 'gesture-positive'); scene.add(p.root); pets.push(p);
    if (i === 0) {
      crown = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: .3, roughness: .4 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.32, .3, .18, 16, 1, true), gold); crown.add(band);
      for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(.08, .22, 6), gold); const a = k / 5 * 6.28; sp.position.set(Math.cos(a) * .3, .18, Math.sin(a) * .3); crown.add(sp); }
      crown.position.set(x, hgt + 1.45, 0); scene.add(crown);
    }
  }
  const L = h(`<div class="podium"><h2>${esc(top[0] ? top[0].name : '')} wins!</h2><div class="rest">${top.map((r, i) => `<span class="chip">${i + 1}. ${esc(r.name)}${r.id === myId ? ' (you)' : ''} · ${r.score}</span>`).join('')}</div></div>`);
  layer.appendChild(L);
  const back = h('<div class="chip podium-back" style="padding:6px 16px 8px;font-size:18px">Back to the lobby in a moment…</div>'); layer.appendChild(back);
  sfx.win();
  return {
    scene,
    tick: (dt, t) => {
      for (const p of pets) p.mixer.update(dt);
      if (crown) { crown.rotation.y += dt * 1.5; crown.position.y += Math.sin(t * 3) * .002; }
      const cam = engine.camera, portrait = cam.aspect < .9;
      cam.position.set(Math.sin(t * .2) * 1.2, portrait ? 4.5 : 3.6, portrait ? 13 : 9); cam.lookAt(0, portrait ? 1.6 : 1.5, 0);
    },
    dispose: () => { for (const p of pets) p.dispose(); L.remove(); back.remove(); },
  };
}
