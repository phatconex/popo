// Cầu Lông Thú — client. Nhân vật của mình chạy ngay trên máy mình; đường bay cầu tính bằng BMPhys.
(() => {
  const P = window.BMPhys;
  const MAP_NAME = { garden: 'Sân vườn', beach: 'Bãi biển', snow: 'Sân tuyết' };
  const ITEM_NAME = { big: 'Vợt khổng lồ!', fire: 'Cầu lửa!', ghost: 'Cầu tàng hình!', slow: 'Làm chậm đối thủ!' };
  const TEAM_COL = ['#e46a92', '#3b8fd1'];
  const SWING_T = .28, SWING_CD = .42;
  const KEYS = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyW: 'j', ArrowUp: 'j', Space: 'j' };
  const SHOT_KEYS = { KeyJ: 'hit', KeyK: 'lob', KeyL: 'drop' };

  let A, root, cv, ctx, el = {};
  let team, teams, mapId, points, itemsOn, picks, st, tr, my, others, keys, joy, raf, sendTimer, lastT, vw, vh, s, ox, gy;
  let pops, sparks, flakes, prevPh, hudKey, overTimer;
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const now = () => performance.now() / 1000;

  // ================== ẢNH BÌA ==================
  function thumb(c, w, h, t) {
    c.fillStyle = '#bfe9ff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a6e08f'; c.fillRect(0, h * .72, w, h);
    c.lineWidth = 2; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(0, h * .72); c.lineTo(w, h * .72); c.stroke();
    if (h < 50) {
      shuttle(c, w / 2, h * .45 + Math.sin(t * 3) * 4, -.6 + Math.sin(t * 3) * .3, h / 40);
      return;
    }
    const k = h / 96;
    rrect(c, w / 2 - 2, h * .72 - 40 * k, 4, 40 * k, 2, '#fff');
    const u = (Math.sin(t * 1.6) + 1) / 2, x = w * (.22 + u * .56), y = h * .62 - Math.sin(u * Math.PI) * h * .45;
    drawAnimal(c, 5, w * .18, h * .86, { scale: 1.2 * k, phase: t * 3, flip: 1 });
    drawAnimal(c, 0, w * .82, h * .86, { scale: 1.2 * k, phase: t * 3 + 1 });
    shuttle(c, x, y, Math.cos(t * 1.6) > 0 ? -.3 : Math.PI + .3, k);
  }

  // ================== MOUNT / UNMOUNT ==================
  function mount(r, api) {
    A = api; root = r;
    root.innerHTML = `
      <div class="bm${A.isTouch ? ' touch' : ''}">
        <canvas class="bm-cv"></canvas>
        <div class="bm-top">
          <div class="bm-score"><span class="tn l"></span><b class="sl">0</b><i>–</i><b class="sr">0</b><span class="tn r"></span></div>
          <div class="bm-chips"><span class="chip wind"></span><span class="chip rally"></span><span class="chip effs"></span></div>
        </div>
        <div class="bm-banner"></div>
        <div class="bm-btns">
          <button class="bb small lob" data-s="lob"><b>Lốp</b></button>
          <button class="bb small drop" data-s="drop"><b>Bỏ nhỏ</b></button>
          <button class="bb jump" data-j="1"><b>Nhảy</b></button>
          <button class="bb hit" data-s="hit"><b>Đánh</b></button>
        </div>
        <div class="bm-keys"><span><kbd>A</kbd><kbd>D</kbd> chạy</span><span><kbd>W</kbd> nhảy</span><span><kbd>J</kbd> hoặc chuột: đánh</span><span><kbd>K</kbd> lốp cao</span><span><kbd>L</kbd> bỏ nhỏ</span><span>Nhảy + đánh = đập cầu</span></div>
        <div class="bm-rot">Xoay ngang điện thoại để chơi thoải mái hơn</div>
        <div class="bm-ov"><div class="card"></div></div>
      </div>`;
    const q = x => root.querySelector(x);
    el = {
      wrap: q('.bm'), sl: q('.sl'), sr: q('.sr'), tl: q('.tn.l'), trn: q('.tn.r'), wind: q('.wind'), rally: q('.rally'), effs: q('.effs'),
      banner: q('.bm-banner'), ov: q('.bm-ov'), card: q('.bm-ov .card'), rot: q('.bm-rot'),
    };
    cv = q('.bm-cv'); ctx = cv.getContext('2d');
    team = -1; teams = [[], []]; picks = {}; st = null; tr = null; others = new Map();
    my = { x: 300, y: 0, vx: 0, vy: 0, air: false, swT: 0, swCD: 0, swC: 0, swKind: 'hit', hit: false };
    keys = { l: 0, r: 0 }; joy = null; pops = []; sparks = []; flakes = []; prevPh = ''; hudKey = ''; lastT = now();

    for (const b of root.querySelectorAll('.bb')) {
      on(b, 'pointerdown', e => {
        e.preventDefault(); b.classList.add('on');
        if (b.dataset.j) jump(); else swing(b.dataset.s);
      });
      const up = () => b.classList.remove('on');
      on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'pointerleave', up);
      on(b, 'contextmenu', e => e.preventDefault());
    }
    on(window, 'keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = KEYS[e.code];
      if (k === 'j') { e.preventDefault(); if (!e.repeat) jump(); }
      else if (k) { e.preventDefault(); keys[k] = 1; }
      else if (SHOT_KEYS[e.code] && !e.repeat) { e.preventDefault(); swing(SHOT_KEYS[e.code]); }
    });
    on(window, 'keyup', e => { const k = KEYS[e.code]; if (k && k !== 'j') keys[k] = 0; });
    on(window, 'blur', () => { keys.l = keys.r = 0; joy = null; });
    on(window, 'resize', resize);
    on(cv, 'pointerdown', onDown); on(cv, 'pointermove', onMove); on(cv, 'pointerup', onUp); on(cv, 'pointercancel', onUp);
    on(cv, 'contextmenu', e => e.preventDefault());
    sendTimer = setInterval(() => { if (team >= 0) A.send({ t: 'p', x: Math.round(my.x), y: Math.round(my.y), sw: my.swC }); }, 50);
    resize();
    raf = requestAnimationFrame(frame);
  }
  function unmount() {
    cancelAnimationFrame(raf); clearInterval(sendTimer); clearInterval(overTimer);
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
  }

  // ================== ĐIỀU KHIỂN ==================
  function onDown(e) {
    if (e.pointerType === 'mouse') { if (e.button === 0) swing('hit'); else if (e.button === 2) swing('lob'); return; }
    if (e.clientX < vw / 2 && !joy) { joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0 }; try { cv.setPointerCapture(e.pointerId); } catch {} }
    else swing('hit');
  }
  function onMove(e) { if (joy && e.pointerId === joy.id) joy.dx = Math.max(-1, Math.min(1, (e.clientX - joy.x) / 50)); }
  function onUp(e) { if (joy && e.pointerId === joy.id) joy = null; }
  const animal = id => P.ANIMALS[picks[id] ?? 0] || P.ANIMALS[0];
  function jump() {
    if (team < 0 || !st || st.ph === 'pick' || my.air) return;
    my.vy = P.BASE.jump * animal(A.myId).jump; my.air = true;
    A.beep(500, .08, 'triangle', .05, 300);
  }
  function swing(kind) {
    if (team < 0 || !st || st.ph === 'pick' || st.ph === 'over') return;
    if (st.ph === 'serve' && st.srv === A.myId) { A.send({ t: 'serve' }); startSwing('serve'); return; }
    if (my.swCD > 0) return;
    startSwing(kind);
  }
  function startSwing(kind) { my.swT = SWING_T; my.swCD = SWING_CD; my.swKind = kind; my.hit = false; my.swC++; }

  // ================== TIN NHẮN ==================
  function onMsg(d) {
    switch (d.t) {
      case 'init': {
        team = d.team; teams = d.teams; mapId = d.map; points = d.points; itemsOn = d.items; picks = d.picks || {};
        const idx = Math.max(0, teams[team] ? teams[team].indexOf(A.myId) : 0);
        my.x = team === 1 ? P.W - 260 - idx * 160 : 260 + idx * 160; my.y = 0; my.vy = 0; my.air = false;
        tr = d.tr ? { tr: d.tr, t0: now() - d.tr.rt, team: d.tr.team, ghost: d.tr.ghost, id: d.tr.id } : null;
        el.wrap.classList.toggle('watch', team < 0);
        const nm = t => teams[t].map(id => A.esc(A.player(id)?.name || '?')).join(' & ');
        el.tl.innerHTML = nm(0); el.trn.innerHTML = nm(1);
        flakes = [];
        hudKey = '';
        if (d.ph === 'pick') showPick(); else el.ov.classList.remove('on');
        resize();
        break;
      }
      case 'picks': picks = d.picks; if (d.done) el.ov.classList.remove('on'); else if (st && st.ph === 'pick') showPick(); break;
      case 's': onSnap(d); break;
      case 'traj': {
        const mine = d.by === A.myId && tr && tr.pred && now() - tr.t0 < .6;
        tr = { tr: d.tr, t0: mine ? tr.t0 : now(), team: d.team, ghost: d.ghost, id: d.id, kind: d.kind };
        if (!mine) hitFx(d.tr.x, d.tr.y, d.kind);
        break;
      }
      case 'pt': {
        tr = null;
        const mineWin = d.team === team;
        const why = d.why === 'out' ? 'Ra ngoài!' : d.why === 'net' ? 'Mắc lưới!' : d.pts > 1 ? 'Ăn 2 điểm!' : 'Ghi điểm!';
        pops.push({ x: Math.max(80, Math.min(P.W - 80, d.x)), y: 120, txt: `${why} +${d.pts}`, col: TEAM_COL[d.team], t: 0, big: 1 });
        (team < 0 || mineWin ? A.sfx.win : A.sfx.lose)();
        A.vibrate(mineWin ? 40 : [60, 40, 60]);
        if (d.over) showOver(d);
        break;
      }
      case 'item':
        pops.push({ x: d.x, y: d.y + 40, txt: ITEM_NAME[d.it], col: '#8f7bff', t: 0 });
        for (let i = 0; i < 14; i++) sparks.push({ x: d.x, y: d.y, vx: (Math.random() - .5) * 400, vy: Math.random() * 300, t: 0, col: ['#ffd36e', '#ff8fb1', '#9fd8ff'][i % 3] });
        A.sfx.pop(); A.beep(1100, .15, 'triangle', .1, 400);
        break;
    }
  }

  function onSnap(m) {
    const was = st;
    st = m;
    for (const id in m.pos) {
      if (+id === A.myId) continue;
      const [x, y, sw] = m.pos[id];
      let o = others.get(+id);
      if (!o) { o = { x, y, sw, swT: 0 }; others.set(+id, o); }
      o.tx = x; o.ty = y;
      if (sw !== o.sw) { o.sw = sw; o.swT = SWING_T; }
    }
    if (m.ph !== prevPh) {
      if (m.ph === 'serve') el.ov.classList.remove('on');
      if (m.ph === 'pick') showPick();
      prevPh = m.ph;
    }
    if (m.ph === 'pick' && el.ov.classList.contains('on')) { const c = el.card.querySelector('.pcount'); if (c) c.textContent = `Bắt đầu sau ${Math.ceil(m.tm)} giây`; }
    // HUD
    const key = [m.sc, m.ph, m.srv, m.rally, m.wind, m.big, m.slow, m.fire, m.ghost].join('|');
    if (key === hudKey) return;
    hudKey = key;
    el.sl.textContent = m.sc[0]; el.sr.textContent = m.sc[1];
    el.wind.style.display = m.wind ? '' : 'none';
    if (m.wind) {
      const n = Math.min(3, Math.ceil(Math.abs(m.wind) / 20));
      el.wind.innerHTML = `Gió <span class="arr${m.wind < 0 ? ' left' : ''}">${'<svg viewBox="0 0 24 24" class="i"><path d="M4 12h14M13 6l6 6-6 6"/></svg>'.repeat(n)}</span>`;
    }
    el.rally.style.display = m.rally >= 3 ? '' : 'none';
    el.rally.className = 'chip rally' + (m.rally >= 10 ? ' hot' : '');
    el.rally.textContent = m.rally >= 10 ? `Pha cầu ${m.rally} · ăn 2 điểm` : `Pha cầu ${m.rally}`;
    const effs = [];
    if (team >= 0) {
      if (m.big[team] > 0) effs.push('Vợt to');
      if (m.fire[team]) effs.push('Cầu lửa');
      if (m.ghost[team]) effs.push('Cầu tàng hình');
      if (m.slow[team] > 0) effs.push('Bị làm chậm');
    }
    el.effs.style.display = effs.length ? '' : 'none';
    el.effs.textContent = effs.join(' · ');
    let ban = '';
    if (m.ph === 'serve') ban = m.srv === A.myId ? (A.isTouch ? 'Bạn giao cầu! Bấm Đánh' : 'Bạn giao cầu! Bấm J hoặc click') : `${A.esc(A.player(m.srv)?.name || '?')} đang giao cầu…`;
    el.banner.innerHTML = ban; el.banner.classList.toggle('on', !!ban);
    if (was && was.ph === 'serve' && m.ph === 'rally') A.beep(700, .06, 'triangle', .08);
  }

  // ================== LỚP PHỦ ==================
  function showPick() {
    const mine = picks[A.myId];
    el.card.innerHTML = `<h2>Chọn bé thú</h2><p class="sub">${MAP_NAME[mapId] || ''} · Chơi tới ${points} điểm${itemsOn ? ' · Có hộp quà' : ''}</p><div class="picks"></div><div class="who"></div><p class="sub pcount"></p>`;
    const box = el.card.querySelector('.picks');
    P.ANIMALS.forEach((an, i) => {
      const b = document.createElement('button');
      b.className = 'pk' + (mine === i ? ' on' : '');
      b.append(avatar(an.kind, 64));
      b.insertAdjacentHTML('beforeend', `<b>${an.name}</b><small>${an.tag}</small>`);
      b.disabled = team < 0;
      b.onclick = () => { A.sfx.pop(); A.send({ t: 'pick', a: i }); };
      box.append(b);
    });
    const who = el.card.querySelector('.who');
    for (const t of [0, 1]) for (const id of teams[t]) {
      const p = A.player(id), a = picks[id];
      who.insertAdjacentHTML('beforeend', `<span style="border-color:${TEAM_COL[t]}">${A.esc(p ? p.name : '?')}: <b>${a == null ? 'đang chọn…' : P.ANIMALS[a].name}</b></span>`);
    }
    el.ov.classList.add('on');
  }
  function showOver(d) {
    clearInterval(overTimer);
    const w = d.team, mineWin = w === team;
    el.card.innerHTML = `<div class="ovbig"></div><h2>${team < 0 ? 'Kết thúc!' : mineWin ? 'Thắng rồi!' : 'Thua mất rồi!'}</h2>
      <p class="sub">${teams[w].map(id => A.esc(A.player(id)?.name || '?')).join(' & ')} thắng ${d.score[w]} – ${d.score[1 - w]}</p><p class="sub ovnext"></p>`;
    const big = el.card.querySelector('.ovbig');
    for (const id of teams[w]) big.append(avatar(animal(id).kind, 80));
    let n = 10;
    const nx = el.card.querySelector('.ovnext');
    const tick = () => { nx.textContent = `Về phòng chờ sau ${n} giây…`; n--; };
    tick(); overTimer = setInterval(tick, 1000);
    setTimeout(() => el.ov.classList.add('on'), 900);
  }

  // ================== VẬT LÝ NHÂN VẬT CỦA MÌNH ==================
  function updateMe(dt) {
    if (team < 0 || !st || st.ph === 'pick') return;
    const an = animal(A.myId);
    const slow = st.slow[team] > 0 ? .6 : 1;
    const dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) || (joy ? (Math.abs(joy.dx) > .15 ? joy.dx : 0) : 0);
    const target = dir * P.BASE.speed * an.speed * slow;
    const grip = mapId === 'snow' ? 3.2 : 16;
    my.vx += (target - my.vx) * Math.min(1, dt * grip);
    my.x += my.vx * dt;
    if (my.air) {
      my.vy -= P.BASE.grav * dt; my.y += my.vy * dt;
      if (my.y <= 0) { my.y = 0; my.vy = 0; my.air = false; }
    }
    const lo = team === 0 ? 30 : P.NET_X + 30, hi = team === 0 ? P.NET_X - 30 : P.W - 30;
    my.x = Math.max(lo, Math.min(hi, my.x));
    my.swCD = Math.max(0, my.swCD - dt);
    if (my.swT > 0) {
      my.swT -= dt;
      if (!my.hit && my.swKind !== 'serve') tryHit(an);
    }
  }
  function face(t) { return t === 1 ? -1 : 1; }
  // khoảng cách từ quả cầu tới cây vợt (một đoạn từ vai lên quá đầu)
  function racketDist(px, py, f, sx, sy) {
    const ax = px + f * 10, ay = py + 45, bx = px + f * 40, by = py + 140;
    const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(sx - (ax + u * dx), sy - (ay + u * dy));
  }
  function tryHit(an) {
    if (!tr || st.ph !== 'rally' || tr.team === team) return;
    const te = now() - tr.t0;
    if (te > tr.tr.tLand || (tr.tr.netHit && te > tr.tr.tNet)) return;
    const sp = P.pos(tr.tr, te);
    const reach = P.BASE.reach * an.reach * (st.big[team] > 0 ? 1.6 : 1);
    if (racketDist(my.x, my.y, face(team), sp.x, sp.y) > reach) return;
    let kind = my.swKind;
    if (kind === 'hit' && my.air && sp.y > 165) kind = 'smash';
    my.hit = true;
    A.send({ t: 'hit', te: +te.toFixed(3), kind, x: Math.round(my.x), y: Math.round(my.y) });
    // đoán trước đường bay để thấy cầu bay đi ngay, server gửi lại sẽ khớp
    tr = { tr: P.aim(kind, sp.x, sp.y, face(team), picks[A.myId], st.fire[team], st.wind), t0: now(), team, ghost: st.ghost[team], pred: true, kind };
    hitFx(sp.x, sp.y, kind);
    A.vibrate(kind === 'smash' ? 40 : 18);
  }
  function hitFx(x, y, kind) {
    const sm = kind === 'smash';
    for (let i = 0; i < (sm ? 12 : 6); i++) sparks.push({ x, y, vx: (Math.random() - .5) * (sm ? 500 : 260), vy: (Math.random() - .3) * (sm ? 400 : 200), t: 0, col: sm ? '#ff9f43' : '#fff' });
    if (sm) pops.push({ x, y: y + 50, txt: 'ĐẬP CẦU!', col: '#ff5d7d', t: 0 });
    A.beep(sm ? 180 : 320, sm ? .12 : .07, 'square', sm ? .1 : .06, sm ? -80 : 200);
  }

  // ================== VẼ ==================
  function resize() {
    const d = Math.min(2, devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = vw * d; cv.height = vh * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const room = A.isTouch ? vw - 170 : vw; // điện thoại: chừa chỗ cho cụm nút bên phải
    s = Math.min(room / 1300, vh / 600);
    ox = room / 2 - P.NET_X * s;
    gy = vh - Math.max(vh * .13, 40);
    el.rot && el.rot.classList.toggle('on', A.isTouch && vh > vw);
  }
  const X = wx => ox + wx * s, Y = wy => gy - wy * s;

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(.05, t - lastT); lastT = t;
    updateMe(dt);
    for (const o of others.values()) { const k = Math.min(1, dt * 14); o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.swT = Math.max(0, o.swT - dt); }
    for (const p of pops) p.t += dt;
    pops = pops.filter(p => p.t < 1.6);
    for (const p of sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 800 * dt; }
    sparks = sparks.filter(p => p.t < .6);

    const c = ctx;
    drawScene(c, t, dt);
    // hộp quà
    if (st && st.box) drawBox(c, X(st.box.x), Y(st.box.y + Math.sin(t * 3) * 6), s, t);
    // điểm rơi dự kiến
    if (tr && !tr.ghost && st && st.ph === 'rally') {
      const te = t - tr.t0;
      if (te < tr.tr.tLand) {
        const lx = X(tr.tr.xLand), out = tr.tr.xLand < P.COURT[0] || tr.tr.xLand > P.COURT[1];
        c.save(); c.globalAlpha = .55 + Math.sin(t * 10) * .15;
        c.setLineDash([5, 5]); c.lineWidth = 3; c.strokeStyle = out ? '#9a8fa3' : '#ff5d7d';
        c.beginPath(); c.ellipse(lx, gy + 4 * s, 24 * s, 7 * s, 0, 0, TAU); c.fillStyle = out ? 'rgba(150,140,160,.2)' : 'rgba(255,93,125,.22)'; c.fill(); c.stroke();
        c.restore();
      }
    }
    // nhân vật
    const list = [];
    if (team >= 0 && st && st.ph !== 'pick') list.push({ id: A.myId, x: my.x, y: my.y, swT: my.swT, moving: Math.abs(my.vx) > 20, me: 1 });
    for (const [id, o] of others) if (picks[id] != null || st) list.push({ id, x: o.x, y: o.y, swT: o.swT, moving: Math.abs(o.tx - o.x) > 2 });
    for (const p of list) drawPlayer(c, p, t);
    // quả cầu
    drawShuttle(c, t, list);
    // tia lửa + chữ nổi
    for (const p of sparks) dot(c, X(p.x), Y(p.y), Math.max(1, (1 - p.t / .6) * 5 * s), p.col);
    for (const p of pops) {
      const a = 1 - Math.max(0, p.t - 1.1) / .5;
      label(c, X(p.x), Y(p.y) - p.t * 40, p.txt, p.col, a, (p.big ? 34 : 24) * Math.max(.7, s));
    }
    // cần điều khiển ảo
    if (joy) {
      c.save(); c.globalAlpha = .5; c.lineWidth = 3; c.strokeStyle = INK;
      circ(c, joy.x, joy.y, 44, 'rgba(255,255,255,.4)');
      circ(c, joy.x + joy.dx * 40, joy.y, 20, '#fff');
      c.restore();
    }
  }

  function drawScene(c, t, dt) {
    const sky = { garden: '#bfe9ff', beach: '#9fe0ff', snow: '#dceeff' }[mapId] || '#bfe9ff';
    c.fillStyle = sky; c.fillRect(0, 0, vw, vh);
    c.lineWidth = 2.5; c.strokeStyle = INK;
    if (mapId === 'beach') {
      dot(c, vw * .86, vh * .14, 34 * s + 10, '#ffd36e');
      const sea = Y(260);
      c.fillStyle = '#6fc7f0'; c.fillRect(0, sea, vw, Y(130) - sea);
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3;
      for (let x = (t * 20) % 60 - 60; x < vw; x += 60) { c.beginPath(); c.arc(x + 30, sea + 14, 10, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      c.fillStyle = '#ffe6a8'; c.fillRect(0, Y(130), vw, vh);
      c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, Y(130)); c.lineTo(vw, Y(130)); c.stroke();
      palm(c, X(-60), Y(0)); palm(c, X(P.W + 60), Y(0));
    } else if (mapId === 'snow') {
      c.fillStyle = '#fff';
      for (let i = -1; i < 8; i++) { const x = X(i * 220 - 40); c.beginPath(); c.moveTo(x - 160 * s, Y(140)); c.lineTo(x, Y(360 + (i % 3) * 50)); c.lineTo(x + 160 * s, Y(140)); c.closePath(); c.fill(); c.stroke(); }
      c.fillStyle = '#eef6ff'; c.fillRect(0, Y(140), vw, vh);
      c.beginPath(); c.moveTo(0, Y(140)); c.lineTo(vw, Y(140)); c.stroke();
      pine(c, X(-50), Y(0), s); pine(c, X(P.W + 50), Y(0), s);
    } else {
      cloudy(c, vw * .15, vh * .14, s); cloudy(c, vw * .7, vh * .1, s);
      c.fillStyle = '#93d77f';
      c.beginPath(); c.ellipse(X(200), Y(120), 420 * s, 160 * s, 0, Math.PI, TAU); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(X(1000), Y(120), 480 * s, 190 * s, 0, Math.PI, TAU); c.fill(); c.stroke();
      c.fillStyle = '#a6e08f'; c.fillRect(0, Y(120), vw, vh);
      c.beginPath(); c.moveTo(0, Y(120)); c.lineTo(vw, Y(120)); c.stroke();
      // hàng rào gỗ
      for (let x = -40; x < P.W + 80; x += 60) rrect(c, X(x) - 5 * s, Y(110), 10 * s, 50 * s, 3 * s, '#e9c48f');
      c.fillStyle = '#e9c48f'; c.fillRect(X(-60), Y(98), (P.W + 140) * s, 7 * s); c.strokeRect(X(-60), Y(98), (P.W + 140) * s, 7 * s);
      for (let i = 0; i < 9; i++) { const x = X(-80 + i * 170), y = Y(70 - (i % 2) * 20); dot(c, x, y, 5 * s, ['#ff8fb1', '#ffd36e', '#fff'][i % 3]); }
    }
    // mặt sân
    const court = { garden: '#7fcf86', beach: '#f8d98e', snow: '#c6ecff' }[mapId] || '#7fcf86';
    c.fillStyle = court;
    c.beginPath(); c.moveTo(X(P.COURT[0]), Y(0)); c.lineTo(X(P.COURT[1]), Y(0)); c.lineTo(X(P.COURT[1] + 30), Y(0) + 34 * s); c.lineTo(X(P.COURT[0] - 30), Y(0) + 34 * s); c.closePath();
    c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(X(P.COURT[0]), Y(0)); c.lineTo(X(P.COURT[1]), Y(0)); c.moveTo(X(P.NET_X), Y(0)); c.lineTo(X(P.NET_X), Y(0) + 34 * s);
    c.moveTo(X(P.COURT[0] - 15), Y(0) + 17 * s); c.lineTo(X(P.COURT[1] + 15), Y(0) + 17 * s); c.stroke();
    if (mapId === 'snow') { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; for (const x of [200, 420, 800, 1000]) { c.beginPath(); c.moveTo(X(x), Y(0) + 10 * s); c.lineTo(X(x + 60), Y(0) + 10 * s); c.stroke(); } }
    // lưới
    const nx = X(P.NET_X), nt = Y(P.NET_H);
    c.lineWidth = 2.5; c.strokeStyle = INK;
    rrect(c, nx - 4 * s, Y(P.NET_H + 6), 8 * s, (P.NET_H + 6) * s, 3 * s, '#fff');
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(nx - 2 * s, nt, 4 * s, P.NET_H * .55 * s);
    c.strokeStyle = 'rgba(74,59,82,.4)'; c.lineWidth = 1;
    for (let y = 0; y < P.NET_H * .55; y += 9) { c.beginPath(); c.moveTo(nx - 3 * s, nt + y * s); c.lineTo(nx + 3 * s, nt + y * s); c.stroke(); }
    c.lineWidth = 2.5; c.strokeStyle = INK; rrect(c, nx - 8 * s, nt - 5 * s, 16 * s, 9 * s, 3 * s, '#fffaf2');
    // tuyết rơi
    if (mapId === 'snow') {
      while (flakes.length < 50) flakes.push({ x: Math.random() * vw, y: Math.random() * vh, v: 20 + Math.random() * 40 });
      for (const f of flakes) { f.y += f.v * dt; f.x += Math.sin(t + f.v) * 10 * dt; if (f.y > vh) { f.y = -5; f.x = Math.random() * vw; } dot(c, f.x, f.y, 2.2, '#fff'); }
    }
  }
  function palm(c, x, y) {
    c.save(); c.translate(x, y); c.scale(s * 1.4, s * 1.4); c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, -60, 4, -130); c.lineWidth = 14; c.strokeStyle = INK; c.stroke(); c.lineWidth = 9; c.strokeStyle = '#c9915e'; c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = INK;
    for (const a of [-2.7, -2, -1.3, -.5, .2]) { c.save(); c.translate(4, -130); c.rotate(a); ell(c, 30, 0, 32, 9, '#6cc77a'); c.restore(); }
    c.restore();
  }
  function pine(c, x, y, k) { c.save(); c.translate(x, y); c.scale(k * 1.6, k * 1.6); c.lineWidth = 2.5; c.strokeStyle = INK; rrect(c, -6, -20, 12, 20, 3, '#a0715a'); poly(c, [0, -130, 34, -70, 18, -70, 44, -20, -44, -20, -18, -70, -34, -70], '#5fb38a'); poly(c, [0, -130, 18, -96, -18, -96], '#fff'); c.restore(); }
  function cloudy(c, x, y, k) { c.save(); c.translate(x, y); c.scale(k * 1.5, k * 1.5); c.lineWidth = 2.5; c.strokeStyle = INK; cloud(c, [[0, 0, 26], [-28, 8, 18], [28, 8, 20]], '#fff'); c.restore(); }

  function drawBox(c, x, y, k, t) {
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * .12); c.scale(k * 1.2, k * 1.2);
    c.lineWidth = 2.6; c.strokeStyle = INK;
    rrect(c, -18, -18, 36, 36, 9, '#c4b5ff');
    c.fillStyle = '#ffd36e'; c.fillRect(-4, -18, 8, 36); c.fillRect(-18, -4, 36, 8);
    c.restore();
    label(c, x + 16 * k, y - 22 * k, '?', '#8f7bff', 1, 22 * k);
  }

  function racket(c, x, y, ang, k, big) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(k, k);
    const hs = big ? 1.5 : 1;
    c.lineCap = 'round'; c.lineWidth = 6; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -26); c.stroke();
    c.lineWidth = 3.5; c.strokeStyle = '#c9915e'; c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -24); c.stroke();
    c.lineWidth = 2.6; c.strokeStyle = INK;
    c.beginPath(); c.ellipse(0, -26 - 14 * hs, 11 * hs, 15 * hs, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); c.stroke();
    c.strokeStyle = 'rgba(74,59,82,.35)'; c.lineWidth = 1;
    for (let i = -7; i <= 7; i += 4.5) { c.beginPath(); c.moveTo(i * hs, -26 - 27 * hs); c.lineTo(i * hs, -26 - 1 * hs); c.stroke(); }
    c.restore();
  }
  function drawPlayer(c, p, t) {
    const tm = teams[0].includes(p.id) ? 0 : 1, f = face(tm), an = animal(p.id);
    const k = s * 2.3, sx = X(p.x), sy = Y(p.y);
    if (p.y > 2) { c.save(); c.globalAlpha = .25; dot(c, sx, Y(0), 20 * s, '#000'); c.restore(); }
    drawAnimal(c, an.kind, sx, sy, { scale: k, flip: f > 0 ? 1 : 0, moving: p.moving && p.y < 2, phase: t * 12 });
    // vợt: nghỉ thì giơ lên sau đầu, vung thì quét về phía trước
    const u = p.swT > 0 ? 1 - p.swT / SWING_T : -1;
    const ang = u < 0 ? -.55 : -1.7 + u * 3.0;
    const big = st && st.big[tm] > 0;
    racket(c, sx + f * 14 * s, sy - 40 * s, f * ang, s * 1.7, big);
    if (u >= 0 && u < .6) { c.save(); c.globalAlpha = .6 * (1 - u); c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(sx + f * 14 * s, sy - 40 * s, 92 * s, f > 0 ? -2.3 : 3.34, f > 0 ? -.2 : 5.44); c.stroke(); c.restore(); }
    // tên
    const nm = A.player(p.id)?.name || '';
    label(c, sx, sy - ANIMAL_H[an.kind] * k - 26 * s, p.me ? 'Bạn' : nm, TEAM_COL[tm], 1, Math.max(12, 15 * s), '#fff');
  }

  function drawShuttle(c, t, list) {
    if (!st) return;
    let x, y, a = 0;
    if (st.ph === 'serve') {
      const sv = list.find(p => p.id === st.srv); if (!sv) return;
      const tm = teams[0].includes(st.srv) ? 0 : 1;
      x = sv.x + face(tm) * 26; y = 70 + Math.sin(t * 4) * 4; a = Math.PI / 2;
    } else if (tr) {
      const te = t - tr.t0, sp = P.pos(tr.tr, te), u = te / tr.tr.tLand;
      if (tr.ghost && u > .25 && u < .8) return;
      x = sp.x; y = sp.y; a = Math.atan2(-sp.vy, sp.vx);
      if (te > tr.tr.tLand) a = tr.tr.vx > 0 ? .35 : Math.PI - .35;
      const hot = st.rally >= 10 || tr.kind === 'smash';
      if (hot && te < tr.tr.tLand) for (let i = 1; i <= 5; i++) { const q = P.pos(tr.tr, te - i * .025); c.save(); c.globalAlpha = .35 - i * .06; dot(c, X(q.x), Y(q.y), (8 - i) * s, st.rally >= 10 ? '#ff9f43' : '#fff'); c.restore(); }
    } else return;
    shuttle(c, X(x), Y(y), a, s * 1.3, st.rally >= 10);
  }
  function shuttle(c, x, y, a, k, hot) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(k, k);
    if (hot) { c.fillStyle = 'rgba(255,159,67,.35)'; c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill(); }
    c.lineWidth = 2; c.strokeStyle = INK; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -3); c.lineTo(-16, -9); c.lineTo(-16, 9); c.lineTo(0, 3); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.moveTo(-4, -4); c.lineTo(-16, -3); c.moveTo(-4, 4); c.lineTo(-16, 3); c.stroke();
    c.lineWidth = 2; circ(c, 2, 0, 5, '#ffd36e');
    c.restore();
  }
  function label(c, x, y, txt, col, alpha, size, bg) {
    c.save(); c.globalAlpha = Math.max(0, alpha);
    c.font = `800 ${size}px "Baloo 2",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (bg) { const w = c.measureText(txt).width + 14; c.lineWidth = 2.2; c.strokeStyle = INK; rrect(c, x - w / 2, y - size * .72, w, size * 1.44, size * .7, bg); c.fillStyle = col; c.fillText(txt, x, y + 1); }
    else { c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); }
    c.restore();
  }

  registerGame('badminton', { thumb, mount, onMsg, unmount });
})();
