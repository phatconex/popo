// Hide & Seek 3D client (work in progress).
let L = null;
export async function mount(ctx) { L = ctx.ui.layer('hs'); L.innerHTML = '<div class="o" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px">Game starting…</div>'; }
export function onMsg() {}
export function unmount() { if (L) L.remove(); L = null; }
