// Open screen: dancing animals on an island, bouncing logo, Tap to Start, then Play / Join Room / How to Play.
import * as THREE from 'three';
import { island } from './island.js';

const css = `
.op-logo{position:absolute;left:0;right:0;top:max(9vh,84px);display:flex;justify-content:center;font-size:min(21vw,160px);line-height:1;pointer-events:none!important;transition:transform .6s cubic-bezier(.3,1.5,.5,1)}
.op-logo span{display:inline-block;-webkit-text-stroke:.09em var(--ink);paint-order:stroke fill;text-shadow:0 .07em 0 var(--ink),0 .14em 0 rgba(20,30,50,.3);animation:ophop 2.4s ease-in-out infinite}
.op-logo span:nth-child(1){color:#ff5d6c}.op-logo span:nth-child(2){color:#ffc727;animation-delay:.12s}.op-logo span:nth-child(3){color:#55d36b;animation-delay:.24s}.op-logo span:nth-child(4){color:#4fb4ff;animation-delay:.36s}.op-logo span:nth-child(5){color:#9a7cff;animation-delay:.48s}
@keyframes ophop{0%,60%,100%{transform:none}20%{transform:translateY(-.14em) scale(.95,1.06) rotate(-4deg)}35%{transform:scale(1.08,.92)}}
.op-sub{position:absolute;left:0;right:0;top:calc(max(9vh,84px) + min(21vw,160px) + 6px);text-align:center;font-size:min(5.6vw,26px);pointer-events:none!important}
.op-tap{position:absolute;left:0;right:0;bottom:14vh;text-align:center;font-size:min(9vw,46px);animation:oppulse 1.2s ease-in-out infinite;pointer-events:none!important;transition:opacity .3s}
@keyframes oppulse{50%{transform:scale(1.07);opacity:.85}}
.op-menu{position:absolute;left:50%;bottom:-70vh;transform:translateX(-50%);width:min(92vw,420px);display:flex;flex-direction:column;gap:14px;transition:bottom .55s cubic-bezier(.3,1.4,.5,1)}
.op-menu.on{bottom:7vh}
.op-menu .row{display:flex;gap:14px}.op-menu .row .b{flex:1;font-size:26px}
.op-menu .b.big{font-size:42px}
.op-top{position:absolute;top:14px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:flex-start}
.op-status{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:15px;pointer-events:none!important}
.op-how{display:grid;gap:10px}.op-how div{display:flex;gap:10px;align-items:flex-start;background:#eef6ff;border-radius:16px;padding:8px 12px}
.op-how b{font-weight:400;display:inline-block;color:#fff;border-radius:10px;padding:0 8px 2px;margin-right:4px}
@media (max-height:620px){.op-logo{top:4vh;font-size:min(17vw,110px)}.op-sub{top:calc(4vh + min(17vw,110px) + 4px)}.op-menu.on{bottom:4vh}.op-menu .b.big{font-size:30px}}
`;
const SOUND_ON = '<svg viewBox="0 0 24 24" fill="#24304a"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="#24304a" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="#24304a"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#24304a" stroke-width="2.4" stroke-linecap="round"/></svg>';

const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export async function enter(ctx) {
  const { engine, ui, net, sfx, assets } = ctx;
  const style = ui.h(`<style>${css}</style>`); document.head.appendChild(style);
  const scene = await island();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, .07, 8, 96), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .02; scene.add(ring);
  const pets = [];
  const dancers = [0, 1, 2, 7, 5, 9];
  for (let i = 0; i < dancers.length; i++) {
    const p = await assets.pet(dancers[i], 1.1), a = i / dancers.length * 6.28;
    p.root.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2); p.root.lookAt(Math.cos(a) * 9, 0, Math.sin(a) * 9);
    p.play('dance', 0); p.mixer.update(i * .37); scene.add(p.root); pets.push({ ...p, kind: 'dance', a });
  }
  for (const [code, r, sp] of [[6, 4.6, 1.2], [4, 4.6, 1.55], [3, 6.6, -.7], [10, 6.6, -.95], [11, 5.6, .5], [15, 7.4, .9]]) {
    const p = await assets.pet(code, code === 3 ? 1.25 : 1); p.play(Math.abs(sp) > 1 ? 'run' : 'walk', 0); scene.add(p.root);
    pets.push({ ...p, kind: 'run', r, sp, a: Math.random() * 6.28, hop: Math.random() * 6 });
  }
  const star = await assets.pet(8, 1.5); scene.add(star.root); pets.push({ ...star, kind: 'star', t: 0 });
  engine.setScene(scene);

  const L = ui.layer('op');
  L.innerHTML = `
    <div class="op-top"><button class="ic" data-a="mute" title="Sound">${sfx.muted ? SOUND_OFF : SOUND_ON}</button></div>
    <div class="op-logo"><span>P</span><span>a</span><span>w</span><span>t</span><span>y</span></div>
    <div class="op-sub o">Tiny games for friends &amp; couples</div>
    <div class="op-tap o">Tap to Start</div>
    <div class="op-menu"></div>
    <div class="op-status o"></div>`;
  const menu = L.querySelector('.op-menu');
  menu.append(ui.btn('Play', 'sun big', () => askName(false)));
  const row = ui.h('<div class="row"></div>');
  row.append(ui.btn('Join Room', '', () => askName(true)), ui.btn('How to Play', 'leaf', howTo));
  menu.append(row);
  const mute = L.querySelector('[data-a=mute]');
  mute.onclick = () => { sfx.setMuted(!sfx.muted); mute.innerHTML = sfx.muted ? SOUND_OFF : SOUND_ON; };

  let started = false, startedAt = 0, dlg = null, clock = 0; // clock is set every frame; declared here because an invite link calls start() right away
  const start = () => {
    if (started) return; started = true; startedAt = clock;
    L.querySelector('.op-tap').style.opacity = 0; menu.classList.add('on'); star.play('gesture-positive'); sfx.pop();
  };
  const onDown = e => { if (!e.target.closest('.op-menu,.ic,.modal-wrap')) start(); };
  addEventListener('pointerdown', onDown);
  const onKey = e => { if (e.code === 'Space' || e.code === 'Enter') start(); };
  addEventListener('keydown', onKey);

  function askName(join, code = '') {
    const body = ui.h(`<div><label>Your name</label><input class="nm" maxlength="14" autocomplete="off" placeholder="e.g. Mochi">
      ${join ? '<label>Room code</label><input class="cd" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:4px">' : ''}
      <div class="err"></div></div>`);
    const nm = body.querySelector('.nm'), cd = body.querySelector('.cd'), err = body.querySelector('.err');
    nm.value = store.get('popo.name', '');
    if (cd) cd.value = code;
    const go = () => {
      const name = nm.value.trim();
      if (!name) { err.textContent = 'Type a name first'; nm.focus(); return; }
      if (cd && cd.value.trim().length !== 4) { err.textContent = 'Room codes have 4 letters'; cd.focus(); return; }
      store.set('popo.name', name);
      let av = +store.get('popo.av', -1); if (!(av >= 0 && av < 24)) { av = Math.random() * 24 | 0; store.set('popo.av', av); }
      err.textContent = 'Connecting…';
      net.join({ name, av, code: cd ? cd.value.trim().toUpperCase() : undefined, game: 'hideseek' });
    };
    dlg = ui.modal({ title: join ? 'Join Room' : 'New Room', body, actions: [{ label: join ? 'Join' : "Let's go!", cls: 'sun', keep: true, onClick: go }], onClose: () => { dlg = null; } });
    dlg.err = err;
    for (const i of [nm, cd]) if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => (code && nm.value ? nm : (nm.value && cd ? cd : nm)).focus(), 50);
  }
  function howTo() {
    ui.modal({
      title: 'How to Play', actions: [{ label: 'Got it!', cls: 'leaf' }],
      body: `<div class="op-how">
        <div><span><b style="background:#55d36b">HIDERS</b> look exactly like the farm animals. Walk slowly, stay with the herd, hide behind trees. Running leaves footprints!</span></div>
        <div><span><b style="background:#ff5d6c">SEEKER</b> has a water gun. Squirt the fakes — but hitting a real animal costs water.</span></div>
        <div><span>Hiders get tricks: <b style="background:#ff8a4c">Run</b> <b style="background:#ffb81f">Call</b> <b style="background:#55d36b">Decoy</b>. Calling takes 3 s off the clock but shows the seeker where you are. Everyone takes a turn as the seeker.</span></div>
      </div>`,
    });
  }

  // invite link ?room=ABCD opens the Join dialog right away
  const q = new URLSearchParams(location.search).get('room');
  if (q && /^[A-Za-z]{4}$/.test(q)) { history.replaceState(null, '', location.pathname); start(); askName(true, q.toUpperCase()); }

  const off = engine.onFrame((dt, t) => {
    clock = t;
    for (const p of pets) {
      p.mixer.update(dt);
      if (p.kind === 'run') { p.a += p.sp / p.r * dt * 1.6; p.root.position.set(Math.cos(p.a) * p.r, Math.abs(Math.sin(t * 6 + p.hop)) * .12, Math.sin(p.a) * p.r); p.root.rotation.y = -p.a + (p.sp > 0 ? 0 : Math.PI); }
      if (p.kind === 'dance') p.root.position.y = Math.max(0, Math.sin(t * 4 + p.a * 2)) * .25;
      if (p.kind === 'star') { p.t -= dt; if (p.t <= 0) { p.t = 3 + Math.random() * 2; p.play(['gesture-positive', 'dance', 'idle', 'eat'][Math.random() * 4 | 0]); } p.root.rotation.y += dt * .4; }
    }
    ring.material.color.setHSL(0, 0, .85 + Math.sin(t * 3) * .15);
    const k = started ? Math.min(1, (t - startedAt) / 1.2) : 0, e = k * k * (3 - 2 * k);
    const cam = engine.camera, portrait = cam.aspect < .9, R = (portrait ? 21 : 16) - e * (portrait ? 5 : 4), H = (portrait ? 13 : 9) - e * 2.5, ang = t * .08;
    cam.position.set(Math.sin(ang) * R, H, Math.cos(ang) * R); cam.lookAt(0, portrait ? -1.5 + e * .8 : 2.2 - e * 2.6, 0);
  });

  return {
    onError(msg) { if (dlg) dlg.err.textContent = msg; else ui.toast(msg, '#ffd0d4'); },
    onDisconnected(d) { L.querySelector('.op-status').textContent = d.opened ? 'Lost connection to the game server — retrying…' : 'Waking up the game server… (can take ~30 s)'; },
    leave() { off(); removeEventListener('pointerdown', onDown); removeEventListener('keydown', onKey); if (dlg) dlg.close(); L.remove(); style.remove(); },
  };
}
