// Popo 3D engine: one renderer + camera for the whole app, a frame loop, quality settings per device.
import * as THREE from 'three';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const quality = { mobile: isTouch, shadows: !isTouch, maxPR: isTouch ? 1.5 : 2, pr: 1 };

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('nogl').hidden = false;
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
quality.pr = Math.min(devicePixelRatio || 1, quality.maxPR);
renderer.setPixelRatio(quality.pr);

const camera = new THREE.PerspectiveCamera(42, 1, .1, 400);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let scene = null;
const frameFns = new Set();
const clock = new THREE.Clock();
// fps watch: if we stay under 40 fps for 3 s, drop the pixel ratio to 1
let fpsT = 0, fpsN = 0, slowFor = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  fpsT += dt; fpsN++;
  if (fpsT >= 1) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    slowFor = fps < 40 && !document.hidden ? slowFor + 1 : 0;
    if (slowFor >= 3 && quality.pr > 1) { quality.pr = 1; renderer.setPixelRatio(1); resize(); }
  }
  for (const fn of frameFns) fn(dt, t);
  if (scene) renderer.render(scene, camera);
}
requestAnimationFrame(loop);

export const engine = {
  renderer, camera, quality, isTouch,
  get scene() { return scene; },
  setScene(s) { scene = s; },
  onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
};

// A scene with sky colour, fog, soft hemisphere light and a sun that can follow a target.
export function makeScene({ sky = '#8fd8ff', fog = [30, 70], ground = '#6fae5a' } = {}) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(sky);
  if (fog) s.fog = new THREE.Fog(sky, fog[0], fog[1]);
  s.add(new THREE.HemisphereLight('#e8f6ff', ground, 1.55));
  const sun = new THREE.DirectionalLight('#fff0cf', 2.5);
  sun.position.set(8, 16, 10);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    sun.shadow.bias = -.0006;
  }
  s.add(sun, sun.target);
  s.userData.sun = sun;
  return s;
}

// Keep the sun (and its shadow box) centred on a point.
export function followSun(s, x, z) {
  const sun = s.userData.sun;
  sun.position.set(x + 8, 16, z + 10);
  sun.target.position.set(x, 0, z);
}

export { THREE };
