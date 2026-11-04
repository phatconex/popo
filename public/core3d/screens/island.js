// A round grass island with trees and flowers — shared backdrop for the Open and Lobby screens.
import * as THREE from 'three';
import { makeScene } from '../engine.js';
import { prop, instanced } from '../assets.js';

export async function island({ radius = 12, trees = 22, ring = [9, 11.4], arc = null, seed = 4 } = {}) {
  const scene = makeScene({ sky: '#8fd8ff', fog: [24, 60] });
  let k = seed; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.03, 1, 64), new THREE.MeshStandardMaterial({ color: '#7fd35b', roughness: 1 }));
  top.position.y = -.5; top.receiveShadow = true; scene.add(top);
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * .72, 3, 64), new THREE.MeshStandardMaterial({ color: '#b5784a', roughness: 1 }));
  dirt.position.y = -2.5; scene.add(dirt);
  const T = [['nature/tree_oak.glb', 3], ['nature/tree_fat.glb', 2.6], ['nature/tree_default.glb', 3.1], ['nature/tree_pineRoundA.glb', 3], ['nature/plant_bushLarge.glb', 1], ['nature/tree_blocks.glb', 2.8], ['nature/rock_largeA.glb', 1.1]];
  const jobs = [];
  for (let i = 0; i < trees; i++) {
    const a = arc ? arc[0] + (i / (trees - 1)) * (arc[1] - arc[0]) + (rnd() - .5) * .15 : i / trees * 6.28 + rnd() * .2;
    const r = ring[0] + rnd() * (ring[1] - ring[0]), [f, h] = T[i % T.length];
    jobs.push(prop(f, h * (.85 + rnd() * .4)).then(o => { o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.y = rnd() * 6.3; scene.add(o); }));
  }
  const small = { 'nature/flower_redA.glb': [], 'nature/flower_yellowA.glb': [], 'nature/flower_purpleA.glb': [], 'nature/mushroom_red.glb': [], 'nature/grass_large.glb': [] };
  const keys = Object.keys(small);
  for (let i = 0; i < 50; i++) { const a = rnd() * 6.28, r = 3 + rnd() * (radius - 4); small[keys[i % keys.length]].push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rnd() * 6.3, s: .8 + rnd() * .5 }); }
  for (const f of keys) jobs.push(instanced(f, .4, small[f]).then(g => scene.add(g)));
  // a few fluffy clouds
  const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1 + rnd() * .8, 12, 10), cm); s.position.set(j * 1.3 - 2, rnd() * .6, rnd()); g.add(s); }
    const a = i / 7 * 6.28; g.position.set(Math.cos(a) * 24, 7 + rnd() * 4, Math.sin(a) * 24); scene.add(g);
  }
  await Promise.all(jobs);
  return scene;
}
