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

// Lighten/saturate a model's own materials once (Kenney greens read too dark under our lights).
const tinted = new Set();
export async function brighten(path, light = .07, sat = .05) {
  if (tinted.has(path)) return;
  tinted.add(path);
  const g = await loadModel(path);
  g.scene.traverse(m => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => mt.color && mt.color.offsetHSL(0, sat, light)); });
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
export async function instanced(path, height, list, opts = {}) {
  const group = new THREE.Group();
  if (!list.length) return group;
  const g = await loadModel(path);
  const base = height / heights.get(path);
  g.scene.updateMatrixWorld(true);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  g.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    im.castShadow = !!opts.shadow && quality.shadows;
    im.receiveShadow = !!opts.receive && quality.shadows;
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry || 0);
      v.set(it.x, it.y || 0, it.z);
      sc.setScalar(base * (it.s || 1));
      m4.compose(v, q, sc).multiply(mesh.matrixWorld);
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
