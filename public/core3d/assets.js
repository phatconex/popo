// Model loading (Kenney GLB, cached), animated pets, static props and instanced props.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { quality } from './engine.js';

export const ANIMALS = window.ANIMALS;
const BASE = 'assets/kenney/';
const loader = new GLTFLoader();
const cache = new Map();
const heights = new Map(); // path -> natural model height

export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(BASE + path).then(g => {
    // Some Kenney packs (nature) ship materials with metalness 1, which turns their shaded sides black
    // under our lights (no environment map). Every model here is meant to be matte.
    g.scene.traverse(m => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => { if ('metalness' in mt) mt.metalness = 0; }); });
    const b = new THREE.Box3().setFromObject(g.scene);
    heights.set(path, Math.max(.01, b.max.y - b.min.y));
    return g;
  }));
  return cache.get(path);
}
export const preload = paths => Promise.all(paths.map(loadModel));

function shade(o, cast, receive) {
  o.traverse(m => { if (m.isMesh) { m.castShadow = cast && quality.shadows; m.receiveShadow = receive && quality.shadows; } });
}

// A static prop scaled to `height` (world units). Returns a Group you can position/rotate.
// opts.fade: give the prop its own materials so its opacity can change (see-through trees).
export async function prop(path, height, opts = {}) {
  const g = await loadModel(path);
  const model = g.scene.clone(true);
  const s = height ? height / heights.get(path) : (opts.scale || 1);
  model.scale.setScalar(s);
  shade(model, opts.shadow !== false, !!opts.receive);
  if (opts.fade) model.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; } });
  const root = new THREE.Group();
  root.add(model);
  return root;
}

// Retint a model's own materials once. light > 0 adds HSL lightness; light < 0 scales the colour down by that
// fraction (keeps dark parts from clipping to black); sat adds saturation. Defaults: the nature pack is pale
// once it is matte (see loadModel), so it is darkened; the other packs read a little dark, so they are lightened.
const tinted = new Set();
// Nature models that never go through brighten() now render matte and lighter than before the metalness fix,
// so every caller that places nature/ models (e.g. Blind Drive scenery) must call brighten() on them first.
const TONE = { nature: [-.7, .1], other: [.07, .05] };
export async function brighten(path, light, sat) {
  if (tinted.has(path)) return;
  tinted.add(path);
  const [l0, s0] = path.startsWith('nature/') ? TONE.nature : TONE.other;
  light = light ?? l0; sat = sat ?? s0;
  const g = await loadModel(path), done = new Set();
  g.scene.traverse(m => {
    if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
      if (!mt.color || done.has(mt)) return;
      done.add(mt);
      if (light >= 0) mt.color.offsetHSL(0, sat, light);
      else mt.color.offsetHSL(0, sat, 0).multiplyScalar(1 + light);
    });
  });
}

// A static prop scaled so its widest horizontal side equals `size` (world units).
export async function fitted(path, size, opts = {}) {
  const g = await loadModel(path);
  const b = new THREE.Box3().setFromObject(g.scene);
  const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) || 1;
  return prop(path, 0, { ...opts, scale: size / w });
}

// Set the opacity of a prop made with {fade:true}.
export function setOpacity(root, a) {
  root.traverse(m => { if (m.isMesh) { m.material.opacity = a; m.material.depthWrite = a > .95; } });
}

// An animated Cube Pet. play(name) cross-fades: idle, walk, run, eat, dance, gesture-positive, gesture-negative, static.
export async function pet(code, height = .9) {
  const a = ANIMALS[code] || ANIMALS[0];
  const path = `pets/animal-${a.id}.glb`;
  const g = await loadModel(path);
  const model = g.scene.clone(true);
  model.scale.setScalar(height / heights.get(path));
  shade(model, true, false);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const acts = {};
  for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
  const p = {
    root, model, mixer, code, cur: null, curName: '',
    play(name, fade = .2) {
      const act = acts[name] || acts.idle;
      if (act === p.cur) return;
      act.reset().fadeIn(fade).play();
      if (p.cur) p.cur.fadeOut(fade);
      p.cur = act; p.curName = name;
    },
    dispose() { mixer.stopAllAction(); root.removeFromParent(); },
  };
  p.play('idle', 0);
  return p;
}

// Many copies of one model as InstancedMeshes (one draw per mesh part). list: [{x, z, ry, s, y}]
// opts.center: shift the model so the middle of its footprint sits on (x, z) — for models whose origin is off to one side (fences).
export async function instanced(path, height, list, opts = {}) {
  const group = new THREE.Group();
  if (!list.length) return group;
  const g = await loadModel(path);
  const base = height / heights.get(path);
  g.scene.updateMatrixWorld(true);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const shift = new THREE.Matrix4();
  if (opts.center) { const c = new THREE.Box3().setFromObject(g.scene).getCenter(new THREE.Vector3()); shift.makeTranslation(-c.x, 0, -c.z); }
  g.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    im.castShadow = !!opts.shadow && quality.shadows;
    im.receiveShadow = !!opts.receive && quality.shadows;
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry || 0);
      v.set(it.x, it.y || 0, it.z);
      sc.setScalar(base * (it.s || 1));
      m4.compose(v, q, sc).multiply(shift).multiply(mesh.matrixWorld);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

// Small portrait images of animals (data URLs), rendered once with a tiny offscreen renderer.
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbs = new Map();
export function thumb(code) {
  if (thumbs.has(code)) return thumbs.get(code);
  const job = (async () => {
    if (!thumbR) {
      thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbR.setSize(96, 96); thumbR.outputColorSpace = THREE.SRGBColorSpace;
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.HemisphereLight('#ffffff', '#99aabb', 2.2));
      const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(2, 3, 4); thumbScene.add(d);
      thumbCam = new THREE.PerspectiveCamera(30, 1, .1, 20); thumbCam.position.set(0, .75, 2.6); thumbCam.lookAt(0, .45, 0);
    }
    const p = await pet(code, .95);
    p.root.rotation.y = .5; thumbScene.add(p.root);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL('image/png');
    p.dispose();
    return url;
  })();
  thumbs.set(code, job);
  return job;
}
