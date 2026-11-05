// Lobby: coloured pedestals with each player's animal, room code + invite, game card, settings, Ready / Start.
import * as THREE from 'three';
import { island } from './island.js';

const css = `
.lb-top{position:absolute;top:14px;left:14px;right:14px;display:flex;align-items:center;gap:12px}
.lb-title{font-size:40px}
.lb-sp{flex:1}
.lb-code{display:flex;align-items:center;gap:10px;background:var(--ink);border-radius:18px;padding:6px 6px 6px 16px;box-shadow:0 5px 0 rgba(0,0,0,.25)}
.lb-code small{display:block;font-size:12px;opacity:.7;margin-bottom:-4px}
.lb-code b{font-weight:400;font-size:30px;letter-spacing:3px}
.lb-code .b{font-size:18px;padding:6px 12px 8px;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 4px 0 #0e1626,0 0 0 3px #0e1626}
.lb-tag{text-align:center}
.lb-tag .p{display:inline-block;font-size:15px;border-radius:10px;padding:0 9px 1px;margin-bottom:8px;box-shadow:0 0 0 3px var(--ink);color:#fff}
.lb-tag .n{display:inline-block;background:#fff;color:var(--ink);border-radius:14px;padding:2px 14px 3px;font-size:19px;box-shadow:0 4px 0 var(--ink),0 0 0 4px var(--ink)}
.lb-tag .r{display:block;margin-top:9px;font-size:16px;color:#7dff6a;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}
.lb-tag.away{opacity:.55}
.lb-tag .m{display:inline-block;color:#fff;font-size:13px;border-radius:9px;padding:0 7px 1px;box-shadow:0 0 0 2.5px var(--ink);text-shadow:0 2px 0 rgba(20,30,50,.3)}
.lb-empty{font-size:16px;text-align:center;line-height:1.1}
.lb-tag .row{display:inline-flex;align-items:center;gap:8px}
.lb-tag .ar{pointer-events:auto;width:40px;height:40px;border-radius:50%;background:#fff;color:var(--ink);font-size:28px;line-height:1;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 0 var(--ink),0 0 0 4px var(--ink);cursor:pointer;padding-bottom:3px;border:0;font-family:inherit;transition:transform .08s}
.lb-tag .ar:active{transform:translateY(4px) scale(.95)}
.lb-tag .m svg{width:14px;height:11px;vertical-align:-1px;margin-right:3px}
.lb-panel{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(980px,calc(100% - 28px));background:rgba(36,48,74,.82);border-radius:26px;padding:12px;display:flex;gap:12px;align-items:stretch;box-shadow:0 6px 0 rgba(0,0,0,.25)}
.lb-games{display:flex;gap:12px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;padding:10px 8px 4px;margin:-10px -4px -4px}
.lb-g{flex:1 0 170px;max-width:340px;border-radius:18px;padding:8px 12px 10px;position:relative;box-shadow:inset 0 -6px 0 rgba(0,0,0,.18),0 0 0 4px #fff,0 0 0 8px var(--ink);transform:translateY(-6px)}
.lb-g svg{width:100%;height:64px;display:block}
.lb-g .nm{font-size:22px;text-shadow:0 3px 0 rgba(20,30,50,.35)}
.lb-g .pl{font-size:13px;opacity:.95}
.lb-g.soon{opacity:.6;transform:none;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 0 0 3px #0e1626;flex:0 0 104px;padding:8px 10px;display:flex;flex-direction:column;justify-content:center}
.lb-g.soon svg{display:none}.lb-g.soon .nm{font-size:15px;line-height:1.1}.lb-g.soon .pl{display:inline-block;margin-top:6px;font-size:11px;background:rgba(20,30,50,.35);border-radius:8px;padding:1px 7px;align-self:flex-start}
.lb-side{display:flex;flex-direction:column;gap:10px;width:310px;flex:none}
.lb-opts{display:flex;flex-direction:column;gap:8px}
.lb-opt{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.12);border-radius:14px;padding:4px 6px 4px 12px;font-size:16px;gap:8px}
.lb-opt .v{display:flex;align-items:center;gap:4px}
.lb-opt i{font-style:normal;width:28px;height:28px;border-radius:9px;background:#fff;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;padding-bottom:2px}
.lb-opt span{min-width:132px;text-align:center;white-space:nowrap;font-size:15px}
.lb-ro .lb-opt i{visibility:hidden}
.lb-acts{display:flex;gap:10px;margin-top:auto}
.lb-acts .b{flex:1;font-size:24px}
.lb-acts .b.on{background:#2fae46}
.lb .emote-btn{top:84px;bottom:auto}.lb .emote-panel{top:150px;bottom:auto}
.lb-wait{flex:1;display:flex;align-items:center;justify-content:center;font-size:17px;opacity:.9;text-align:center}
.lb-panel.tm{flex-wrap:wrap}
.lb-teams{flex:none;width:100%;box-sizing:border-box;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.lb-team{border-radius:16px;padding:6px 8px 8px;display:flex;flex-direction:column;gap:5px;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 0 0 3px var(--ink);min-width:0}
.lb-team .tn{font-size:20px;text-shadow:0 2px 0 rgba(20,30,50,.35)}
.lb-team .tc{display:flex;flex-direction:column;gap:4px;min-height:96px}
.lb-team .ch{display:flex;align-items:center;gap:6px;background:#fff;color:var(--ink);border-radius:10px;box-shadow:0 0 0 3px var(--ink);padding:1px 6px 1px 2px;font-size:14px;min-width:0;height:30px}
.lb-team .ch img{width:26px;height:26px;border-radius:8px;flex:none}
.lb-team .ch span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-team .b{font-size:16px;padding:3px 8px 5px}
@media (max-width:560px){.lb-teams{grid-template-columns:repeat(2,1fr);gap:8px}.lb-team .tc{min-height:0}.lb-team .tn{font-size:17px}.lb-team .ch{height:26px;font-size:12px}.lb-team .ch img{width:22px;height:22px}}
@media (max-width:760px){
  .lb-title{font-size:30px}.lb-code b{font-size:22px}.lb-code small{font-size:10px}.lb-code .b{font-size:15px}
  .lb-panel{flex-direction:column;padding:10px;gap:10px;border-radius:22px}
  .lb-side{width:auto}.lb-g{flex:0 0 150px}.lb-g.soon{flex:0 0 96px}.lb-g svg{height:44px}.lb-g .nm{font-size:18px}
  .lb-opts{flex-direction:row;overflow-x:auto}.lb-opt{flex:none;font-size:14px}.lb-opt span{min-width:64px;font-size:13px}
  .lb-acts .b{font-size:22px}
  .lb-empty{font-size:12px;-webkit-text-stroke-width:4px}
}`;
const ART = {
  hideseek: '<rect x="6" y="34" width="108" height="24" rx="6" fill="#3fa94f"/><circle cx="30" cy="30" r="18" fill="#2f8c40"/><circle cx="46" cy="24" r="14" fill="#2f8c40"/><rect x="74" y="20" width="26" height="22" rx="4" fill="#d9a35b" stroke="#24304a" stroke-width="3"/><circle cx="40" cy="36" r="5" fill="#fff"/><circle cx="41" cy="36" r="2.4" fill="#24304a"/><path d="M96 44 l14 -6" stroke="#4fb4ff" stroke-width="4" stroke-linecap="round"/>',
  drive: '<rect x="44" y="0" width="32" height="62" fill="#4b4f63"/><rect x="58" y="4" width="4" height="10" fill="#fff"/><rect x="58" y="24" width="4" height="10" fill="#fff"/><rect x="48" y="30" width="18" height="26" rx="5" fill="#ff5d6c" stroke="#24304a" stroke-width="3"/>',
  badminton: '<rect x="0" y="48" width="120" height="14" fill="#3fa94f"/><rect x="58" y="22" width="4" height="28" fill="#24304a"/><path d="M20 40 Q 60 -6 100 36" stroke="#fff" stroke-width="3" stroke-dasharray="4 5" fill="none"/><circle cx="84" cy="18" r="5" fill="#fff" stroke="#24304a" stroke-width="2"/>',
};
const TEAM_COL = ['#ff5d6c', '#4fb4ff', '#55d36b', '#ffc727'], NO_TEAM = '#c4cad6';
const CROWN = '<svg width="44" height="32" viewBox="0 0 46 34"><path d="M4 30 L2 8 L14 18 L23 3 L32 18 L44 8 L42 30 Z" fill="#ffd23f" stroke="#24304a" stroke-width="4" stroke-linejoin="round"/><circle cx="23" cy="22" r="3.5" fill="#ff5d6c"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="#24304a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';

export async function enter(ctx) {
  const { engine, ui, net, sfx, assets, app } = ctx;
  const { ANIMALS } = assets;
  const style = ui.h(`<style>${css}</style>`); document.head.appendChild(style);
  const scene = await island({ radius: 11, trees: 18, ring: [7.5, 10], arc: [Math.PI * 1.02, Math.PI * 1.98], seed: 7 });
  engine.setScene(scene);

  const L = ui.layer('lb');
  L.innerHTML = `
    <div class="lb-top"><button class="ic" data-a="back" title="Leave room">${BACK}</button><div class="lb-title o">Lobby</div><div class="lb-sp"></div>
      <div class="lb-code"><div><small>ROOM CODE</small><b class="cd">----</b></div></div></div>
    <div class="lb-panel"><div class="lb-games"></div><div class="lb-side"><div class="lb-opts"></div><div class="lb-acts"></div></div></div>`;
  const codeBox = L.querySelector('.lb-code');
  codeBox.appendChild(ui.btn('Invite', '', invite));
  L.querySelector('[data-a=back]').onclick = () => ui.modal({ title: 'Leave room?', body: 'You can join again with the room code.', actions: [{ label: 'Stay', cls: 'white' }, { label: 'Leave', cls: 'rose', onClick: () => app.leaveRoom() }] });
  ui.emoteControl(L, e => net.send({ t: 'emote', e }));

  const slots = new Map(); // player id -> slot
  let empty = null, lobby = null, portrait = false;

  function pedestal(color) {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .14, 40), new THREE.MeshStandardMaterial({ color: '#24304a' })); rim.position.y = .07;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.86, .96, .5, 40), new THREE.MeshStandardMaterial({ color, roughness: .55 })); body.position.y = .3; body.castShadow = body.receiveShadow = engine.quality.shadows;
    const hl = new THREE.Mesh(new THREE.TorusGeometry(.78, .05, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55 })); hl.rotation.x = Math.PI / 2; hl.position.y = .56;
    g.add(rim, body, hl); g.userData.body = body; g.userData.hl = hl; scene.add(g); return g;
  }
  async function setPet(s, code) {
    s.code = code;
    const p = await assets.pet(code, 1.25);
    if (s.code !== code || s.gone) { p.dispose(); return; }
    if (s.pet) s.pet.dispose();
    s.pet = p; p.root.position.y = .55; s.ped.add(p.root); s.pop = 1;
    p.play(s.ready ? 'dance' : 'idle', 0);
  }

  function teamsMeta() {
    const games = net.games || [], g = games.find(x => x.id === lobby.game) || games[0];
    return g && g.teams || null;
  }
  function renderTeams(T, el) {
    el.innerHTML = '';
    const me = lobby.players.find(p => p.id === net.myId);
    for (let t = 0; t < T.count; t++) {
      const mem = lobby.players.filter(p => p.team === t);
      const col = ui.h(`<div class="lb-team" style="background:${TEAM_COL[t]}"><div class="tn o">${ui.esc((T.names || [])[t] || 'Team ' + (t + 1))}</div><div class="tc"></div></div>`);
      const tc = col.querySelector('.tc');
      for (const p of mem) {
        const ch = ui.h(`<div class="ch"><img alt=""><span>${ui.esc(p.name)}</span></div>`);
        assets.thumb(p.av).then(u => { ch.querySelector('img').src = u; }, () => {});
        tc.appendChild(ch);
      }
      const mine = me && me.team === t, full = mem.length >= T.max && !mine;
      const b = ui.btn(mine ? 'Leave' : 'Join', mine ? 'white' : 'sun', () => { net.send({ t: 'profile', team: mine ? -1 : t }); });
      if (full) b.disabled = true;
      col.appendChild(b);
      el.appendChild(col);
    }
  }

  function update(m) {
    lobby = m;
    const TM = teamsMeta();
    const players = m.players, meIsHost = m.host === net.myId;
    codeBox.querySelector('.cd').textContent = m.code;
    // add / update
    players.forEach((p, i) => {
      let s = slots.get(p.id);
      const color = TM && p.team >= 0 ? TEAM_COL[p.team] : TM ? NO_TEAM : ui.PCOL[i % ui.PCOL.length];
      if (!s) {
        s = { id: p.id, ped: pedestal(color), code: -1 };
        s.tag = ui.tag(s.ped, '', { y: 0, below: true, cls: 'lb-tag' });
        s.tag.el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) changeAnimal(+b.dataset.d); });
        s.crown = ui.tag(s.ped, CROWN, { y: 2.05 });
        slots.set(p.id, s);
      }
      s.ped.userData.body.material.color.set(color);
      s.index = i; s.me = p.id === net.myId;
      if (s.ready !== p.ready && s.pet) { if (p.ready) { s.pet.play('gesture-positive'); setTimeout(() => s.ready && s.pet && s.pet.play('dance'), 900); } else s.pet.play('idle'); }
      s.ready = p.ready;
      if (s.code !== p.av) setPet(s, p.av);
      s.tag.el.classList.toggle('away', !p.on);
      s.p = p; s.color = color;
      s.crown.el.style.visibility = p.id === m.host ? 'visible' : 'hidden';
    });
    // remove
    for (const [id, s] of slots) if (!players.some(p => p.id === id)) { s.gone = true; s.ped.removeFromParent(); s.tag.remove(); s.crown.remove(); if (s.pet) s.pet.dispose(); slots.delete(id); }
    // empty pedestal
    if (players.length < 12 && !empty) { empty = { ped: pedestal('#cfd6e2') }; empty.tag = ui.tag(empty.ped, '<div class="lb-empty o">Waiting for<br>a friend…</div>', { y: 1.15 }); }
    if (players.length >= 12 && empty) { empty.ped.removeFromParent(); empty.tag.remove(); empty = null; }
    layout();
    renderPanel(meIsHost);
  }

  // Pedestal positions: desktop 1–3 rows, phone portrait = me in front, everyone else smaller behind.
  let rows = 1;
  function layout() {
    portrait = engine.camera.aspect < .9;
    const list = [...slots.values()].sort((a, b) => a.index - b.index).map(s => s.ped);
    if (empty) list.push(empty.ped);
    const n = list.length;
    if (!portrait) {
      rows = n <= 5 ? 1 : n <= 10 ? 2 : 3;
      const per = Math.ceil(n / rows), sc = [1, .85, .72][rows - 1];
      list.forEach((ped, i) => {
        const r = Math.floor(i / per), k = i % per, cnt = Math.min(per, n - r * per);
        ped.position.set((k - (cnt - 1) / 2) * 2.4 * sc + (r % 2 ? 1.1 * sc : 0), 0, -r * 2.5 * sc);
        ped.scale.setScalar(sc); ped.userData.row = r;
      });
    } else {
      const meSlot = [...slots.values()].find(s => s.me);
      const others = list.filter(p => !meSlot || p !== meSlot.ped);
      rows = 1 + Math.ceil(others.length / 3);
      if (meSlot) { meSlot.ped.position.set(0, 0, 1.3); meSlot.ped.scale.setScalar(1.2); meSlot.ped.userData.row = 0; }
      others.forEach((ped, i) => {
        const r = Math.floor(i / 3), k = i % 3, cnt = Math.min(3, others.length - r * 3);
        ped.position.set((k - (cnt - 1) / 2) * 1.8, 0, -1.6 - r * 1.75); ped.scale.setScalar(.6); ped.userData.row = r + 1;
      });
    }
    for (const s of slots.values()) {
      const back = s.ped.userData.row > 0, p = s.p, mini = back && (portrait || rows > 1);
      s.tag.y = back ? 1.95 * s.ped.scale.x : 0; s.tag.below = !back;
      const host = lobby.host === s.id, CR = '<svg viewBox="0 0 46 34"><path d="M4 30 L2 8 L14 18 L23 3 L32 18 L44 8 L42 30 Z" fill="#ffd23f" stroke="#24304a" stroke-width="5" stroke-linejoin="round"/></svg>';
      const name = `<span class="n">${ui.esc(p.name)} · ${ANIMALS[p.av].name}</span>`;
      s.tag.el.classList.toggle('mini', mini);
      s.tag.el.innerHTML = mini
        ? `<span class="m" style="background:${s.color}">${host ? CR : ''}${p.ready ? '✓ ' : ''}${ui.esc(p.name)}</span>`
        : `<span class="p" style="background:${s.color}">P${s.index + 1}${s.me ? ' · You' : ''}</span><br>${s.me ? `<span class="row"><button class="ar" data-d="-1" title="Previous animal">‹</button>${name}<button class="ar" data-d="1" title="Next animal">›</button></span>` : name}${p.ready ? '<span class="r">✓ Ready</span>' : p.on ? '' : '<span class="r" style="color:#ffd0d4">away…</span>'}`;
      s.crown.y = 1.95 * s.ped.scale.x; s.crown.el.style.display = back && mini ? 'none' : '';
    }
  }
  addEventListener('resize', layout);

  function renderPanel(isHost) {
    const games = net.games || [];
    const g = games.find(x => x.id === lobby.game) || games[0];
    const box = L.querySelector('.lb-games');
    if (!box.dataset.done && g) {
      box.dataset.done = 1;
      box.innerHTML = `<div class="lb-g" style="background:#55d36b"><svg viewBox="0 0 120 62">${ART[g.id] || ''}</svg><div class="nm">${g.name}</div><div class="pl">${g.min}–${g.max} players</div></div>
        <div class="lb-g soon" style="background:#4fb4ff"><svg viewBox="0 0 120 62">${ART.drive}</svg><div class="nm">Blind Drive</div><div class="pl">SOON</div></div>
        <div class="lb-g soon" style="background:#ff8a4c"><svg viewBox="0 0 120 62">${ART.badminton}</svg><div class="nm">Critter Badminton</div><div class="pl">SOON</div></div>`;
    }
    const panel = L.querySelector('.lb-panel'), T = teamsMeta();
    panel.classList.toggle('tm', !!T);
    let tbox = panel.querySelector('.lb-teams');
    if (T) { if (!tbox) { tbox = ui.h('<div class="lb-teams"></div>'); panel.insertBefore(tbox, panel.firstChild); } renderTeams(T, tbox); }
    else if (tbox) tbox.remove();
    const opts = L.querySelector('.lb-opts');
    opts.classList.toggle('lb-ro', !isHost);
    opts.innerHTML = '';
    for (const o of (g && g.settings) || []) {
      const cur = o.options.findIndex(x => String(x.v) === String(lobby.settings[o.key]));
      const row = ui.h(`<div class="lb-opt">${o.label}<div class="v"><i data-d="-1">‹</i><span>${o.options[Math.max(0, cur)].label}</span><i data-d="1">›</i></div></div>`);
      row.querySelectorAll('i').forEach(b => b.onclick = () => {
        sfx.click();
        const n = o.options.length, next = o.options[(Math.max(0, cur) + +b.dataset.d + n) % n].v;
        net.send({ t: 'settings', settings: { ...lobby.settings, [o.key]: next } });
      });
      opts.appendChild(row);
    }
    const acts = L.querySelector('.lb-acts'), me = lobby.players.find(p => p.id === net.myId);
    acts.innerHTML = '';
    const rb = ui.btn(me && me.ready ? '✓ Ready' : 'Ready', 'leaf' + (me && me.ready ? ' on' : ''), () => net.send({ t: 'profile', ready: !(me && me.ready) }));
    acts.appendChild(rb);
    if (isHost) {
      const online = lobby.players.filter(p => p.on).length, min = g ? g.min : 2;
      const sb = ui.btn(online < min ? `Need ${min}+` : 'Start!', 'sun', () => net.send({ t: 'start' }));
      if (online < min) sb.disabled = true;
      acts.appendChild(sb);
    } else acts.appendChild(ui.h('<div class="lb-wait o">Waiting for host…</div>'));
  }

  function changeAnimal(d) {
    const me = lobby && lobby.players.find(p => p.id === net.myId);
    if (!me) return;
    const av = (me.av + d + ANIMALS.length) % ANIMALS.length;
    try { localStorage.setItem('popo.av', av); } catch {}
    net.send({ t: 'profile', av }); sfx.pop();
  }
  const onKey = e => { if (e.target.tagName === 'INPUT') return; if (e.code === 'ArrowLeft') changeAnimal(-1); if (e.code === 'ArrowRight') changeAnimal(1); if (e.code === 'Enter') { const me = lobby.players.find(p => p.id === net.myId); net.send({ t: 'profile', ready: !me.ready }); } };
  addEventListener('keydown', onKey);

  async function invite() {
    const url = `${location.origin}${location.pathname}?room=${lobby.code}`;
    try { await navigator.clipboard.writeText(url); ui.toast('Invite link copied!', '#c9f7c0'); }
    catch { ui.modal({ title: 'Invite', body: `<label>Send this link to your friends</label><input value="${url}" readonly onclick="this.select()">`, actions: [{ label: 'Done', cls: 'sun' }] }); }
  }

  update(app.lobby);
  const v = new THREE.Vector3();
  const off = engine.onFrame((dt, t) => {
    const cam = engine.camera, th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), panelH = L.querySelector('.lb-panel').offsetHeight / innerHeight;
    if (portrait !== cam.aspect < .9) layout();
    if (portrait) { const d = Math.max(8, 3.3 / (th * cam.aspect)) + (rows - 2) * 1.2; cam.position.set(0, d * .42, d * .92 - (rows - 2) * .6); cam.lookAt(0, -.1 - panelH * 4.5, -(rows - 1) * .5); }
    else { const per = Math.ceil((slots.size + (empty ? 1 : 0)) / rows), halfW = per * 1.2 * [1, .85, .72][rows - 1] + 1; const d = Math.max(9, halfW / (th * cam.aspect)); cam.position.set(Math.sin(t * .15) * .6, d * .3 + (rows - 1) * 1.2, d - (rows - 1) * .4); cam.lookAt(0, .75 - panelH * 3.2 - (rows - 1) * .3, -(rows - 1) * 1.6); }
    for (const s of slots.values()) {
      if (!s.pet) continue;
      s.pet.mixer.update(dt);
      if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt * 4); const q = 1 + Math.sin(s.pop * Math.PI) * .25; s.pet.root.scale.set(q, 1.2 - .2 * q, q); }
    }
    if (empty) empty.ped.userData.hl.material.opacity = .3 + Math.sin(t * 3) * .25;
  });

  return {
    update,
    onEmote(id, e) { const s = slots.get(id); if (s && s.pet) ui.emoteOn(s.pet.root, e, 1.4); },
    onError(msg) { ui.toast(msg, '#ffd0d4'); },
    leave() { off(); removeEventListener('keydown', onKey); removeEventListener('resize', layout); for (const s of slots.values()) { s.tag.remove(); s.crown.remove(); s.pet && s.pet.dispose(); } if (empty) empty.tag.remove(); L.remove(); style.remove(); },
  };
}
