// Ambient life around the camera target: butterflies (country), falling snow (snow), sea sparkles (beach),
// fireflies (night). Everything lives in a box that follows the target, so the cost is the same on any track.
// Halved on phones. Adapted from hideseek3d/ambient.js; heights are above y = 0 plus the target's height.
import * as THREE from 'three';

export function makeAmbient(theme, scene, mobile) {
  const k = mobile ? .5 : 1;
  if (theme === 'snow') return snow(scene, Math.round(900 * k));
  if (theme === 'beach') return sparkles(scene, Math.round(160 * k));
  if (theme === 'night') return fireflies(scene, Math.round(60 * k));
  return butterflies(scene, Math.round(22 * k));
}

function snow(scene, n) {
  const box = new THREE.Vector3(40, 16, 40), pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * box.x; pos[i * 3 + 1] = Math.random() * box.y; pos[i * 3 + 2] = (Math.random() - .5) * box.z; spd[i] = .6 + Math.random() * .9; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffffff', size: .11, transparent: true, opacity: .9, depthWrite: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; scene.add(pts);
  let t = 0;
  return {
    tick(dt, c) {
      t += dt; pts.position.set(c.x, c.y || 0, c.z);
      for (let i = 0; i < n; i++) {
        let y = pos[i * 3 + 1] - spd[i] * dt; if (y < 0) y += box.y;
        pos[i * 3 + 1] = y; pos[i * 3] += Math.sin(t * .8 + i) * dt * .25;
      }
      g.attributes.position.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}

// Glints on the sea. The sea comes with the scenery (a later task), which sets `sea = {x, z, y}` to the point
// of the water nearest the camera target each frame; until then the sparkles stay hidden.
function sparkles(scene, n) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 40; pos[i * 3 + 1] = .07; pos[i * 3 + 2] = (Math.random() - .5) * 14; ph[i] = Math.random() * 6.3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffffff', size: .16, transparent: true, opacity: .8, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  let t = 0;
  return {
    sea: null,
    tick(dt) {
      t += dt;
      pts.visible = !!this.sea;
      if (!this.sea) return;
      pts.position.set(this.sea.x, this.sea.y || 0, this.sea.z);
      mat.opacity = .45 + Math.sin(t * 3) * .35;
      for (let i = 0; i < n; i++) pos[i * 3] += Math.sin(t + ph[i]) * dt * .3;
      g.attributes.position.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}

function fireflies(scene, n) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { base[i * 3] = (Math.random() - .5) * 36; base[i * 3 + 1] = .5 + Math.random() * 2; base[i * 3 + 2] = (Math.random() - .5) * 36; ph[i] = Math.random() * 6.3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#fff3a0', size: .14, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  let t = 0;
  return {
    tick(dt, c) {
      t += dt; pts.position.set(c.x, c.y || 0, c.z);
      for (let i = 0; i < n; i++) {
        const p = ph[i];
        pos[i * 3] = base[i * 3] + Math.sin(t * .5 + p) * 1.2;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * .9 + p * 2) * .3;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * .4 + p) * 1.2;
      }
      mat.opacity = .6 + Math.sin(t * 2.3) * .3;
      g.attributes.position.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}

function butterflies(scene, n) {
  const cols = ['#ffd23f', '#ff8fb1', '#9fd8ff', '#ffffff', '#c7a8ff'];
  const wing = new THREE.PlaneGeometry(.13, .1); wing.translate(.065, 0, 0);
  const mats = cols.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const list = [], turn = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), m = mats[i % mats.length];
    const l = new THREE.Mesh(wing, m), r = new THREE.Mesh(wing, m); r.scale.x = -1; g.add(l, r);
    g.position.set((Math.random() - .5) * 28, 1, (Math.random() - .5) * 28);
    scene.add(g);
    list.push({ g, l, r, ph: Math.random() * 6.3, v: new THREE.Vector3(Math.random() - .5, 0, Math.random() - .5).normalize().multiplyScalar(.6 + Math.random() * .6) });
  }
  let t = 0;
  return {
    tick(dt, c) {
      t += dt;
      for (const b of list) {
        const f = Math.sin(t * 14 + b.ph) * 1.1;
        b.l.rotation.y = f; b.r.rotation.y = -f;
        b.v.applyAxisAngle(turn, Math.sin(t * .7 + b.ph) * dt * 1.2);
        b.g.position.addScaledVector(b.v, dt);
        b.g.position.y = (c.y || 0) + 1.1 + Math.sin(t * 1.3 + b.ph) * .35;
        b.g.rotation.y = Math.atan2(b.v.x, b.v.z);
        const dx = b.g.position.x - c.x, dz = b.g.position.z - c.z;
        if (Math.abs(dx) > 15) b.g.position.x = c.x - Math.sign(dx) * 14;
        if (Math.abs(dz) > 15) b.g.position.z = c.z - Math.sign(dz) * 14;
      }
    },
    dispose() { for (const b of list) b.g.removeFromParent(); wing.dispose(); mats.forEach(m => m.dispose()); },
  };
}
