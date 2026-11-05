// HTML overlay helpers: elements, modal, toast, labels that follow 3D objects.
import * as THREE from 'three';
import { sfx } from './sfx.js';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const uiRoot = document.getElementById('ui');

// A layer for one screen; remove() clears it.
export function layer(cls = '') {
  const el = h(`<div class="layer ${cls}"></div>`);
  uiRoot.appendChild(el);
  return el;
}

export function btn(label, cls, onClick) {
  const b = h(`<button class="b ${cls || ''}">${label}</button>`);
  b.addEventListener('click', e => { sfx.click(); onClick && onClick(e); });
  return b;
}

// modal({ title, body (html or element), actions: [{label, cls, onClick, keep}] }) → { el, close() }
export function modal({ title, body, actions = [], onClose }) {
  const wrap = h(`<div class="modal-wrap"><div class="modal"><h2 class="o">${title}</h2><div class="mbody"></div><div class="mact"></div></div></div>`);
  const mb = wrap.querySelector('.mbody');
  if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); onClose && onClose(); };
  for (const a of actions) wrap.querySelector('.mact').appendChild(btn(a.label, a.cls, e => { a.onClick && a.onClick(e); if (!a.keep) close(); }));
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap && onClose !== false) close(); });
  document.body.appendChild(wrap);
  return { el: wrap, close };
}

export function toast(text, bg = '#fff', ms = 2200) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('<div id="toasts"></div>'); document.body.appendChild(box); }
  const t = h(`<div class="toast chip" style="background:${bg}">${text}</div>`);
  box.prepend(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
  return t;
}

// Labels that follow 3D objects. tag(obj, html, {y, cls}) → { el, obj, remove() }; call updateTags(camera) each frame.
const tagRoot = document.getElementById('tags');
const tags = new Set();
const v = new THREE.Vector3();
export function tag(obj, html, opts = {}) {
  const el = h(`<div class="tag3d ${opts.cls || ''}">${html}</div>`);
  tagRoot.appendChild(el);
  const t = { el, obj, y: opts.y ?? 1.3, below: !!opts.below, remove() { el.remove(); tags.delete(t); } };
  tags.add(t);
  return t;
}
export function updateTags(camera) {
  for (const t of tags) {
    if (!t.obj.parent) { t.el.style.display = 'none'; continue; }
    t.obj.getWorldPosition(v); v.y += t.y; v.project(camera);
    const on = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
    t.el.style.display = on ? '' : 'none';
    if (on) t.el.style.transform = `translate(${(v.x * .5 + .5) * innerWidth}px,${(-v.y * .5 + .5) * innerHeight}px) translate(-50%,${t.below ? '0' : '-100%'})`;
  }
}
export function clearTags() { for (const t of [...tags]) t.remove(); }

// Player colours by join order (spec §2).
export const PCOL = ['#ff5d6c', '#4fb4ff', '#55d36b', '#ffc727', '#9a7cff', '#ff8a4c', '#ff7fc8', '#3fd0c9', '#b98557', '#3f6fd8', '#a8d93f', '#8c96a8'];

// Emote bubble (8 SVG emotes from index.html) above a 3D object.
export function emoteOn(obj, e, y = 1.6) {
  const t = tag(obj, `<div class="emote"><svg viewBox="0 0 48 48"><use href="#e-${e | 0}"/></svg></div>`, { y });
  setTimeout(() => t.remove(), 1800);
}

// Emote button + panel; onPick(e) is called with 0..7.
export function emoteControl(parent, onPick) {
  const b = h('<button class="ic emote-btn" title="Emotes"><svg viewBox="0 0 48 48"><use href="#e-1"/></svg></button>');
  const p = h(`<div class="emote-panel">${Array.from({ length: 8 }, (_, i) => `<button data-e="${i}"><svg viewBox="0 0 48 48"><use href="#e-${i}"/></svg></button>`).join('')}</div>`);
  b.onclick = () => p.classList.toggle('on');
  p.onclick = e => { const x = e.target.closest('button'); if (!x) return; p.classList.remove('on'); onPick(+x.dataset.e); };
  parent.append(b, p);
  return { button: b, panel: p };
}

// Iris transition between screens: cover() closes a circle of colour over everything, reveal() opens it again.
let wipeEl = null;
function wipe() {
  if (!wipeEl) { wipeEl = h('<div id="wipe"><div class="paw"></div></div>'); document.body.appendChild(wipeEl); }
  return wipeEl;
}
export function cover(ms = 380) {
  const w = wipe();
  if (w.classList.contains('closed')) return Promise.resolve();
  w.classList.remove('opening'); void w.offsetWidth; w.classList.add('closing');
  return new Promise(r => setTimeout(() => { w.classList.add('closed'); r(); }, ms));
}
export function reveal() {
  const w = wipe();
  if (!w.classList.contains('closed')) return;
  w.classList.remove('closing', 'closed'); void w.offsetWidth; w.classList.add('opening');
}
