// Ambient life around the camera: butterflies (farm), falling snow (snow), sparkles on the sea (beach).
// Everything lives in a box that follows the camera target, so the cost stays the same on any map size.
import * as THREE from 'three';

export function makeAmbient(theme, scene, mobile) {
  const k = mobile ? .5 : 1;
  if (theme === 'snow') return snow(scene, Math.round(900 * k));
  if (theme === 'beach') return sparkles(scene, Math.round(160 * k));
  return butterflies(scene, Math.round(22 * k));
}

function snow(scene, n) {
  const box = new THREE.Vector3(34, 14, 26), pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * box.x; pos[i * 3 + 1] = Math.random() * box.y; pos[i * 3 + 2] = (Math.random() - .5) * box.z; spd[i] = .6 + Math.random() * .9; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: .11, transparent: true, opacity: .9, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  let t = 0;
  return {
    tick(dt, c) {
      t += dt; pts.position.set(c.x, 0, c.z);
      for (let i = 0; i < n; i++) {
        let y = pos[i * 3 + 1] - spd[i] * dt; if (y < 0) y += box.y;
        pos[i * 3 + 1] = y; pos[i * 3] += Math.sin(t * .8 + i) * dt * .25;
      }
      g.attributes.position.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); g.dispose(); },
  };
}

function sparkles(scene, n) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 40; pos[i * 3 + 1] = .07; pos[i * 3 + 2] = Math.random() * 14; ph[i] = Math.random() * 6.3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffffff', size: .16, transparent: true, opacity: .8, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  let t = 0;
  return {
    seaTop: 0,
    tick(dt, c) {
      t += dt;
      pts.position.set(c.x, 0, this.seaTop + .5);
      mat.opacity = .45 + Math.sin(t * 3) * .35;
      for (let i = 0; i < n; i++) pos[i * 3] += Math.sin(t + ph[i]) * dt * .3;
      g.attributes.position.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); g.dispose(); },
  };
}

function butterflies(scene, n) {
  const cols = ['#ffd23f', '#ff8fb1', '#9fd8ff', '#ffffff', '#c7a8ff'];
  const wing = new THREE.PlaneGeometry(.13, .1); wing.translate(.065, 0, 0);
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide });
    const l = new THREE.Mesh(wing, m), r = new THREE.Mesh(wing, m); r.scale.x = -1; g.add(l, r);
    g.position.set((Math.random() - .5) * 28, .6 + Math.random() * 1.2, (Math.random() - .5) * 20);
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
        b.v.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * .7 + b.ph) * dt * 1.2);
        b.g.position.addScaledVector(b.v, dt); b.g.position.y = .7 + Math.sin(t * 1.3 + b.ph) * .35 + .4;
        b.g.rotation.y = Math.atan2(b.v.x, b.v.z);
        // keep them around the camera target
        const dx = b.g.position.x - c.x, dz = b.g.position.z - c.z;
        if (Math.abs(dx) > 15) b.g.position.x = c.x - Math.sign(dx) * 14;
        if (Math.abs(dz) > 11) b.g.position.z = c.z - Math.sign(dz) * 10;
      }
    },
    dispose() { for (const b of list) b.g.removeFromParent(); wing.dispose(); },
  };
}

// Wind for instanced grass/flowers/crops: bends vertices by their height.
export function sway(group, uniforms, amp = .12) {
  for (const im of group.children) {
    const m = im.material = im.material.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swPh = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        #else
          float swPh = 0.0;
        #endif
        transformed.x += sin(uTime * 2.2 + swPh) * position.y * ${amp.toFixed(3)};
        transformed.z += cos(uTime * 1.7 + swPh) * position.y * ${(amp * .6).toFixed(3)};`);
    };
    m.customProgramCacheKey = () => 'sway' + amp;
  }
  return group;
}
