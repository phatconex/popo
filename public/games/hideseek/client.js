// Trốn Tìm Nông Trại — client. Đăng ký với lõi bằng registerGame().
(() => {
  const CD_MAX = { say: 8, sleep: 25, decoy: 15, listen: 25 };
  const SENSE = [['Xa lắm…', '#7b9cff'], ['Ở gần đây!', '#ff9f43'], ['Rất gần!!', '#ff5d7d']];
  const svg = d => `<svg viewBox="0 0 24 24" class="i">${d}</svg>`;
  const ICON = {
    run: svg('<path d="M13 4.5a1.5 1.5 0 1 0 0-.01M7 21l3-6 3 2 1 4M10 15l1-5 4 3 3-1M11 10l-3 1-2 3"/>'),
    swap: svg('<path d="M4 9h13l-3-3M20 15H7l3 3"/>'),
    say: svg('<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M10 13V8l4-1v5"/><circle cx="9" cy="13" r="1"/><circle cx="13" cy="12" r="1"/>'),
    sleep: svg('<path d="M4 6h6l-6 7h6M13 11h5l-5 6h5"/>'),
    decoy: svg('<path d="M12 3c-4 0-7 3-7 7v10l2.3-2 2.4 2 2.3-2 2.3 2 2.4-2L19 20V10c0-4-3-7-7-7z"/><circle cx="9.5" cy="10" r="1"/><circle cx="14.5" cy="10" r="1"/>'),
    listen: svg('<path d="M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2"/><path d="M10 10a2 2 0 0 1 4 0"/><path d="M3 8a9 9 0 0 1 2-4M21 8a9 9 0 0 0-2-4"/>'),
  };
  const ACTIONS = {
    hider: [
      { id: 'run', label: 'Chạy', key: 'Shift', hold: true, touchOnly: true },
      { id: 'swap', label: 'Đổi thú', key: 'Q', msg: 'skin', phase: 'hiding' },
      { id: 'say', label: 'Kêu −3s', key: 'E', msg: 'say', cd: 'say', phase: 'playing' },
      { id: 'sleep', label: 'Giả ngủ', key: 'F', msg: 'sleep', cd: 'sleep' },
      { id: 'decoy', label: 'Mồi nhử', key: 'R', msg: 'decoy', cd: 'decoy', count: 'decoys' },
    ],
    seeker: [{ id: 'listen', label: 'Nghe ngóng', key: 'F', msg: 'listen', cd: 'listen', phase: 'playing' }],
  };
  const KEYMAP = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', ShiftLeft: 'run', ShiftRight: 'run' };

  let A, root, cv, ctx, mini, mctx, el = {};
  let snap, map, gfx, role, roundInfo, raf, inputTimer, senseTimer;
  let disp, fx, floats, bubbles, rings;
  let cam, vw, vh, Z, dpr;
  let mouse, aim, keys, joy, touchRun, lastInputJson, actKey, hudKey, lastTm, roundTimer;
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  // ================== ẢNH BÌA ==================
  function thumb(c, w, h, t) {
    c.fillStyle = '#9ddf8f'; c.fillRect(0, 0, w, h);
    if (h < 50) { drawAnimal(c, 0, w / 2 + 2, h * .8, { scale: .78, phase: t * 4 }); return; }
    c.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse((i * 53) % w, (i * 37) % h, 40, 20, 0, 0, TAU); c.fill(); }
    const k = h / 96;
    drawAnimal(c, 2, w * .2, h * .78, { scale: 1.1 * k, phase: t * 11, moving: true, flip: 1 });
    drawAnimal(c, 0, w * .42, h * .86, { scale: 1.15 * k, phase: t * 11 + 2, moving: true, flip: 1 });
    drawAnimal(c, 3, w * .58, h * .62, { scale: 1 * k, phase: t * 2, sleep: true, time: t });
    drawFarmer(c, w * .82, h * .92, { scale: .95 * k, ang: Math.PI + Math.sin(t) * .3, moving: true, phase: t * 12 });
  }

  // ================== MOUNT / UNMOUNT ==================
  function mount(r, api) {
    A = api; root = r;
    root.innerHTML = `
      <div class="hs${A.isTouch ? ' touch' : ''}">
        <canvas class="hs-cv"></canvas>
        <div class="hs-hud">
          <div class="hs-l"><div class="chip role"></div><div class="hpbar"><svg class="i f"><use href="#i-heart"/></svg><div class="hp"><i></i></div></div></div>
          <div class="hs-m"><div class="chip time"><svg class="i"><use href="#i-clock"/></svg><span class="tt">0:00</span></div><div class="rtag"></div></div>
          <div class="hs-r"><div class="chip np left"><svg class="i f"><use href="#i-paw"/></svg><span></span></div><div class="pips"></div></div>
        </div>
        <div class="hs-feed"></div>
        <canvas class="hs-mini"></canvas>
        <div class="hs-keys"></div>
        <div class="hs-acts"></div>
        <div class="hs-sense"></div>
        <div class="hs-round"><div class="card"><div class="rbig"></div><h2></h2><p class="sub rsub"></p><div class="rlist"></div><p class="sub rnext"></p></div></div>
      </div>`;
    const q = s => root.querySelector(s);
    el = {
      role: q('.role'), hpWrap: q('.hpbar'), hp: q('.hp>i'), time: q('.time'), tt: q('.tt'), rtag: q('.rtag'), left: q('.left span'), pips: q('.pips'),
      feed: q('.hs-feed'), keys: q('.hs-keys'), acts: q('.hs-acts'), sense: q('.hs-sense'), round: q('.hs-round'),
    };
    cv = q('.hs-cv'); ctx = cv.getContext('2d');
    mini = q('.hs-mini'); mctx = mini.getContext('2d');
    snap = map = gfx = role = roundInfo = null;
    disp = new Map(); fx = []; floats = []; bubbles = []; rings = [];
    cam = { x: 0, y: 0 }; mouse = { x: 0, y: 0 }; aim = null;
    keys = { l: 0, r: 0, u: 0, d: 0, run: 0 }; joy = null; touchRun = 0; lastInputJson = ''; actKey = hudKey = ''; lastTm = -1;

    on(window, 'resize', resize);
    on(window, 'keydown', onKey);
    on(window, 'keyup', e => { const k = KEYMAP[e.code]; if (k && keys[k]) { keys[k] = 0; pushInput(); } });
    on(window, 'blur', () => { for (const k in keys) keys[k] = 0; joy = null; touchRun = 0; pushInput(); });
    on(cv, 'pointerdown', onDown);
    on(cv, 'pointermove', onMove);
    on(cv, 'pointerup', onUp);
    on(cv, 'pointercancel', onUp);
    on(cv, 'contextmenu', e => e.preventDefault());
    inputTimer = setInterval(() => pushInput(role === 'seeker'), 80);
    resize();
    raf = requestAnimationFrame(frame);
  }
  function unmount() {
    cancelAnimationFrame(raf);
    clearInterval(inputTimer); clearInterval(roundTimer); clearTimeout(senseTimer);
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
  }

  // ================== TIN NHẮN ==================
  function onMsg(d) {
    switch (d.t) {
      case 'init':
        role = d.role; map = d.map; gfx = HSThemes.build(map);
        roundInfo = { round: d.round, total: d.total };
        snap = null; disp.clear(); fx = []; floats = []; bubbles = []; rings = []; aim = null;
        actKey = hudKey = '';
        mini.width = gfx.mw * 2; mini.height = gfx.mh * 2;
        mini.style.width = gfx.mw + 'px'; mini.style.aspectRatio = `${gfx.mw} / ${gfx.mh}`;
        el.round.classList.remove('on'); clearInterval(roundTimer);
        el.rtag.textContent = `Ván ${d.round}/${d.total} · ${HSThemes.NAMES[map.theme]}`;
        el.feed.innerHTML = '';
        feed(role === 'seeker' ? 'Bạn là NGƯỜI TÌM! Đếm xong là đi bắt nhé' : 'Bạn là NGƯỜI TRỐN! Mau lẫn vào đàn thú', role === 'seeker' ? 'farmer' : null);
        A.beep(role === 'seeker' ? 300 : 700, .3, 'triangle', .15, role === 'seeker' ? -100 : 300);
        A.vibrate(60);
        resize();
        break;
      case 's': onSnap(d); break;
      case 'fx': onFx(d); break;
      case 'round': showRound(d); break;
      case 'sense': {
        const [txt, col] = SENSE[d.level];
        el.sense.textContent = txt; el.sense.style.background = col; el.sense.classList.add('on');
        clearTimeout(senseTimer); senseTimer = setTimeout(() => el.sense.classList.remove('on'), 2200);
        A.vibrate(d.level === 2 ? [80, 60, 80] : 40);
        A.beep([300, 500, 800][d.level], .25, 'sine', .12, 200);
        break;
      }
    }
  }

  function onSnap(m) {
    snap = m;
    const seen = new Set();
    const up = (id, x, y) => {
      seen.add(id);
      let d = disp.get(id);
      if (!d) { d = { x, y, tx: x, ty: y, moving: false, still: 0 }; disp.set(id, d); }
      d.still = Math.hypot(x - d.tx, y - d.ty) > .3 ? 0 : d.still + 1;
      d.moving = d.still < 2;
      d.tx = x; d.ty = y;
    };
    for (const e of m.e) up(e[0], e[1], e[2]);
    for (const k of m.k) up('k' + k[0], k[2], k[3]);
    for (const id of disp.keys()) if (!seen.has(id)) disp.delete(id);

    const me = m.me;
    const key = me.role + me.alive + me.skin;
    if (key !== hudKey) {
      hudKey = key;
      el.role.innerHTML = '';
      el.role.append(avatar(me.role === 'seeker' ? 'farmer' : me.skin, 32, me.alive ? null : '#e6dde8'));
      el.role.insertAdjacentHTML('beforeend', me.role === 'seeker' ? (me.alive ? 'Người tìm' : 'Kiệt sức rồi') : (me.alive ? `Bạn là ${ANIMAL_NAMES[me.skin]}` : 'Bị bắt rồi'));
    }
    el.hpWrap.style.display = me.role === 'seeker' ? '' : 'none';
    el.hp.style.width = me.hp + '%';
    el.tt.textContent = (m.ph === 'hiding' ? 'Trốn ' : '') + Math.floor(m.tm / 60) + ':' + String(m.tm % 60).padStart(2, '0');
    el.time.classList.toggle('warn', m.ph === 'playing' && m.tm <= 20);
    el.left.textContent = `${m.hl}/${m.ht} người trốn`;
    const pips = Array.from({ length: m.ht }, (_, i) => `<i class="pip${i >= m.hl ? ' out' : ''}"></i>`).join('');
    if (el.pips.innerHTML !== pips) el.pips.innerHTML = pips;
    if (m.ph === 'hiding' && m.tm !== lastTm && m.tm <= 5) A.beep(1200, .04, 'sine', .05);
    lastTm = m.tm;
    updateActions(m);
  }

  function onFx(m) {
    if (m.kind === 'shot') {
      fx.push({ ...m, life: .4 });
      A.beep(900, .12, 'triangle', .1, -600);
      if (m.by === A.myId) A.vibrate(15);
      if (m.hit === 1) {
        bubbles.push({ x: m.x2, y: m.y2 - 30, txt: 'Oan quá!', life: 1.4, angry: true });
        const s = snap && snap.k.find(k => k[0] === m.by);
        if (s) floats.push({ x: s[2], y: s[3] - 80, txt: '-15', heart: true, col: '#ff5d7d', life: 1.3 });
        if (m.by === A.myId) { A.sfx.lose(); A.vibrate([40, 40, 40]); }
      } else if (m.hit === 2) {
        floats.push({ x: m.x2, y: m.y2 - 20, txt: 'Bắt được!', stars: true, col: '#ff8fb1', life: 1.6 });
        feed(`<b>${A.esc(m.seeker)}</b>&nbsp;bắt được&nbsp;<b>${A.esc(m.name)}</b>!`, m.skin);
        A.sfx.win();
        if (m.vid === A.myId) A.vibrate([200, 80, 300]);
      } else fx.push({ kind: 'splash', x: m.x2, y: m.y2, life: .5 });
    } else if (m.kind === 'say') {
      bubbles.push({ x: m.x, y: m.y - 50, txt: ANIMAL_SOUNDS[m.skin], life: 1.7 });
      A.beep([180, 120, 500, 700, 380, 900][m.skin % 6] * (1 + (m.skin / 6 | 0) * .25), .18, "sawtooth", .04, [80, -40, -150, 300, -100, 200][m.skin % 6]);
    } else if (m.kind === 'listen') {
      rings.push({ x: m.x, y: m.y - 30, life: 1.2 });
      if (role === 'hider') feed('Người tìm đang nghe ngóng…', 'farmer');
    } else if (m.kind === 'down') {
      feed(`<b>${A.esc(m.name)}</b>&nbsp;bắn nhầm nhiều quá, kiệt sức!`, 'farmer');
    }
  }

  function feed(html, av) {
    const d = document.createElement('div');
    if (av != null) d.append(avatar(av, 26)); else d.className = 'np';
    d.insertAdjacentHTML('beforeend', html);
    el.feed.prepend(d);
    while (el.feed.children.length > 3) el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 4000);
  }

  function showRound(d) {
    const box = el.round, big = box.querySelector('.rbig');
    const iWon = d.rows.find(r => r.id === A.myId);
    big.innerHTML = '';
    if (d.last) {
      const top = d.rows[0];
      big.append(avatar(A.player(top.id)?.av ?? 0, 88));
      box.querySelector('h2').textContent = d.rows.filter(r => r.score === top.score).map(r => r.name).join(' & ') + ' vô địch!';
      box.querySelector('.rsub').textContent = `Chung cuộc sau ${d.total} ván`;
    } else {
      if (d.winner === 'seeker') d.rows.filter(r => r.role === 'seeker').forEach(() => big.append(avatar('farmer', 76)));
      else d.rows.filter(r => r.role === 'hider').slice(0, 4).forEach(r => big.append(avatar(r.skin ?? 0, 76)));
      box.querySelector('h2').textContent = d.winner === 'seeker' ? 'Người tìm thắng!' : 'Người trốn thắng!';
      box.querySelector('.rsub').textContent = `Ván ${d.round}/${d.total}`;
    }
    const list = box.querySelector('.rlist'); list.innerHTML = '';
    d.rows.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'rl' + (r.id === A.myId ? ' me' : '');
      row.insertAdjacentHTML('beforeend', `<span class="rank">${i + 1}</span>`);
      row.append(avatar(A.player(r.id)?.av ?? 0, 30));
      const st = r.role === 'seeker' ? (r.alive ? 'người tìm' : 'tìm · kiệt sức') : (r.alive ? 'trốn · sống sót' : 'trốn · bị bắt');
      row.insertAdjacentHTML('beforeend', `<span class="nm">${A.esc(r.name)}<small>${st}</small></span><span class="pts">+${r.pts}</span><span class="tot">${r.score}</span>`);
      list.append(row);
    });
    box.classList.add('on');
    let left = Math.ceil(d.wait || 7);
    const next = box.querySelector('.rnext');
    const tickTxt = () => { next.textContent = d.last ? `Về phòng chờ sau ${left}s…` : `Ván tiếp theo sau ${left}s — đổi vai!`; left = Math.max(0, left - 1); };
    tickTxt(); clearInterval(roundTimer); roundTimer = setInterval(tickTxt, 1000);
    const good = d.last ? iWon && iWon.score === d.rows[0].score : (d.winner === role);
    good ? A.sfx.win() : A.sfx.lose();
  }

  // ================== NÚT KỸ NĂNG ==================
  function updateActions(m) {
    const me = m.me;
    const key = me.alive ? me.role + m.ph : 'dead';
    if (key !== actKey) {
      actKey = key;
      el.acts.innerHTML = '';
      el.keys.innerHTML = '';
      if (me.alive) {
        for (const a of ACTIONS[me.role]) {
          if (a.touchOnly && !A.isTouch) continue;
          if (a.phase && a.phase !== m.ph) continue;
          const b = document.createElement('button');
          b.className = 'act act-' + a.id; b.dataset.id = a.id;
          b.innerHTML = `${ICON[a.id]}<b>${a.label}</b>${A.isTouch ? '' : `<kbd>${a.key}</kbd>`}<em class="cnt"></em><i class="cdt"></i>`;
          if (a.hold) {
            on(b, 'pointerdown', e => { e.preventDefault(); touchRun = 1; b.classList.add('held'); pushInput(); });
            for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) on(b, ev, () => { touchRun = 0; b.classList.remove('held'); pushInput(); });
          } else on(b, 'pointerdown', e => { e.preventDefault(); doAction(a); });
          a.el = b;
          el.acts.append(b);
        }
        if (A.isTouch) el.keys.innerHTML = me.role === 'seeker'
          ? '<span>Kéo bên trái để đi · Chạm bên phải để bắn</span>'
          : '<span>Kéo bên trái để đi · Giữ nút Chạy (để lại dấu chân!)</span>';
        else el.keys.innerHTML = me.role === 'seeker'
          ? '<span><kbd>W A S D</kbd> di chuyển</span><span><kbd>Chuột</kbd> ngắm &amp; bắn</span>'
          : '<span><kbd>W A S D</kbd> đi chậm như thú</span><span><kbd>Shift</kbd> chạy (để lại dấu chân!)</span>';
      } else el.keys.innerHTML = '<span>Đang xem… đợi ván sau nha</span>';
    }
    if (!me.alive) return;
    for (const a of ACTIONS[me.role]) {
      if (!a.el || !a.el.isConnected) continue;
      const cd = a.cd ? me.cd[a.cd] : 0;
      a.el.style.setProperty('--p', a.cd ? cd / CD_MAX[a.cd] : 0);
      a.el.querySelector('.cdt').textContent = cd ? cd : '';
      const cnt = a.count ? me[a.count] : null;
      a.el.querySelector('.cnt').textContent = cnt != null ? cnt : '';
      a.el.classList.toggle('off', cd > 0 || cnt === 0 || (a.id === 'sleep' && me.sleep));
      a.el.classList.toggle('active', a.id === 'sleep' && !!me.sleep);
    }
  }
  function doAction(a) {
    if (!snap || !snap.me.alive) return;
    A.send({ t: a.msg });
    A.vibrate(12);
    A.sfx.click();
  }

  // ================== ĐIỀU KHIỂN ==================
  function onKey(e) {
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); if (!keys[k]) { keys[k] = 1; pushInput(); } return; }
    if (e.repeat || !snap) return;
    const map2 = { KeyQ: 'swap', KeyE: 'say', KeyF: role === 'seeker' ? 'listen' : 'sleep', KeyR: 'decoy' };
    const id = map2[e.code];
    const a = id && ACTIONS[snap.me.role].find(x => x.id === id);
    if (a && (!a.phase || a.phase === snap.ph)) doAction(a);
  }
  function screenToWorld(x, y) { return { x: x / Z + cam.x, y: y / Z + cam.y }; }
  function onDown(e) {
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (role === 'seeker' && e.button === 0) shootAt(e.clientX, e.clientY);
      return;
    }
    if (!joy && e.clientX < vw * .5) {
      joy = { id: e.pointerId, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch {}
      pushInput();
    } else if (role === 'seeker') shootAt(e.clientX, e.clientY);
  }
  function onMove(e) {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; return; }
    if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
  }
  function onUp(e) { if (joy && e.pointerId === joy.id) { joy = null; pushInput(); } }
  function shootAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    aim = w;
    A.send({ t: 'shoot', x: w.x, y: w.y });
  }
  function myAng() {
    const d = disp.get('k' + A.myId); if (!d) return 0;
    const t = A.isTouch ? aim : screenToWorld(mouse.x, mouse.y);
    if (!t) return 0;
    return Math.atan2(t.y - (d.y - 24), t.x - d.x);
  }
  function inputVec() {
    let mx = keys.r - keys.l, my = keys.d - keys.u;
    if (joy) {
      const dx = joy.x - joy.bx, dy = joy.y - joy.by, l = Math.hypot(dx, dy);
      if (l > 8) { const k = Math.min(1, l / 50) / l; mx = dx * k; my = dy * k; }
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    return { mx: +mx.toFixed(2), my: +my.toFixed(2), run: !!(keys.run || touchRun) };
  }
  function pushInput(force) {
    if (!snap) return;
    const v = inputVec(), j = JSON.stringify(v);
    if (j === lastInputJson && !force) return;
    lastInputJson = j;
    A.send({ t: 'in', ...v, ang: role === 'seeker' ? +myAng().toFixed(2) : 0 });
  }

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = vw * dpr; cv.height = vh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Z = Math.max(A.isTouch ? .6 : .7, Math.min(1.25, Math.min(vw / 1300, vh / 820)));
  }

  // ================== VẼ ==================
  function bubble(c, x, y, txt, alpha, angry) {
    c.save(); c.globalAlpha = alpha;
    c.font = '800 15px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 22, h = 28;
    c.lineWidth = 2.6; c.strokeStyle = INK; c.lineJoin = 'round';
    c.beginPath(); c.roundRect(x - w / 2, y - h, w, h, 14);
    c.moveTo(x - 6, y); c.lineTo(x, y + 9); c.lineTo(x + 6, y);
    c.fillStyle = angry ? '#ffe0e8' : '#fff'; c.fill(); c.stroke();
    c.fillStyle = angry ? '#ffe0e8' : '#fff'; c.fillRect(x - 5, y - 2, 10, 3);
    c.fillStyle = angry ? '#e46a92' : INK; c.fillText(txt, x, y - h / 2 + 1);
    c.restore();
  }
  function tag(c, txt, x, y, fg, bg, arrow) {
    c.save();
    c.font = '800 13px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 16;
    c.lineWidth = 2.4; c.strokeStyle = INK; c.lineJoin = 'round';
    c.beginPath(); c.roundRect(x - w / 2, y - 10, w, 20, 10);
    if (arrow) { c.moveTo(x - 5, y + 10); c.lineTo(x, y + 16); c.lineTo(x + 5, y + 10); }
    c.fillStyle = bg; c.fill(); c.stroke();
    if (arrow) c.fillRect(x - 4, y + 8, 8, 3);
    c.fillStyle = fg; c.fillText(txt, x, y + 1);
    c.restore();
  }
  function paw(c, x, y, a, alpha, col) {
    c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2); c.globalAlpha = alpha; c.fillStyle = col;
    c.beginPath(); c.ellipse(0, 2, 3.6, 4.4, 0, 0, TAU); c.fill();
    for (const [ox, oy] of [[-3.6, -4], [0, -5.6], [3.6, -4]]) { c.beginPath(); c.arc(ox, oy, 1.7, 0, TAU); c.fill(); }
    c.restore();
  }

  let lastT = performance.now();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
    const sec = t / 1000;
    if (!snap || !map) { ctx.fillStyle = '#9ddf8f'; ctx.fillRect(0, 0, vw, vh); return; }
    const W = map.W, H = map.H;
    const k = Math.min(1, dt * 14);
    for (const d of disp.values()) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; }

    const me = snap.me;
    let focus = me.alive ? disp.get(me.role === 'seeker' ? 'k' + A.myId : me.eid) : null;
    if (!focus) { const s = snap.k.find(q => q[6]); focus = s && disp.get('k' + s[0]); }
    focus = focus || { x: W / 2, y: H / 2 };
    const ww = vw / Z, wh = vh / Z;
    cam.x = ww < W ? Math.max(0, Math.min(W - ww, focus.x - ww / 2)) : (W - ww) / 2;
    cam.y = wh < H ? Math.max(0, Math.min(H - wh, focus.y - wh / 2)) : (H - wh) / 2;

    ctx.fillStyle = map.theme === 'snow' ? '#dde9f5' : map.theme === 'beach' ? '#f0d9a0' : '#8fd88d';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.scale(Z, Z); ctx.translate(-cam.x, -cam.y);
    const sx = Math.max(0, cam.x | 0), sy = Math.max(0, cam.y | 0), sw = Math.min(W - sx, Math.ceil(ww) + 2), sh = Math.min(H - sy, Math.ceil(wh) + 2);
    ctx.drawImage(gfx.world, sx, sy, sw, sh, sx, sy, sw, sh);
    const inView = (x, y, pad = 90) => x > cam.x - pad && x < cam.x + ww + pad && y > cam.y - pad && y < cam.y + wh + pad;

    for (const f of snap.fp) if (inView(f[0], f[1])) paw(ctx, f[0], f[1], f[2], Math.max(0, 1 - f[3] / 5) * .9, gfx.fp);

    const mates = new Map((snap.mates || []).map(m => [m[0], m[1]]));
    const list = [];
    for (const e of snap.e) { const d = disp.get(e[0]); if (d && inView(d.x, d.y)) list.push({ e, d }); }
    for (const s of snap.k) if (s[6]) { const d = disp.get('k' + s[0]); if (d && inView(d.x, d.y)) list.push({ s, d }); }
    list.sort((a, b) => a.d.y - b.d.y);
    const labels = [];
    for (const it of list) {
      const d = it.d;
      if (it.e) {
        const [id, , , kind, flip, fl] = it.e, stun = fl & 1, sleep = fl & 2;
        if (id === me.eid) {
          ctx.save(); ctx.strokeStyle = '#ff8fb1'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -sec * 20;
          ctx.beginPath(); ctx.ellipse(d.x, d.y, 24, 9, 0, 0, TAU); ctx.stroke(); ctx.restore();
        }
        drawAnimal(ctx, kind, d.x, d.y, { flip, moving: d.moving && !stun && !sleep, phase: sec * 11 + id, stun, sleep, time: sec + id });
        if (id === me.eid) labels.push(() => tag(ctx, 'Bạn', d.x, d.y - ANIMAL_H[kind] - 22 - Math.sin(sec * 4) * 3, '#fff', '#ff8fb1', true));
        else if (mates.has(id)) labels.push(() => tag(ctx, mates.get(id), d.x, d.y - ANIMAL_H[kind] - 16, INK, 'rgba(255,250,242,.85)'));
      } else {
        const [id, name, , , hp, ang] = it.s;
        drawFarmer(ctx, d.x, d.y, { ang: id === A.myId ? myAng() : ang, moving: d.moving, phase: sec * 12 });
        labels.push(() => {
          tag(ctx, name, d.x, d.y - 84, '#fff', '#8f7bff');
          ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = INK;
          rrect(ctx, d.x - 22, d.y - 72, 44, 7, 3.5, '#fff');
          ctx.beginPath(); ctx.roundRect(d.x - 21, d.y - 71, Math.max(0, 42 * hp / 100), 5, 2.5); ctx.fillStyle = '#ff6b8b'; ctx.fill();
          ctx.restore();
        });
      }
    }
    // cây + bụi che phía trên — mờ đi nếu mình đứng dưới
    const near = (x, y, r) => Math.hypot(focus.x - x, focus.y - y) < r;
    const tops = [];
    for (const [x, y, v] of map.bushes) if (inView(x, y)) tops.push([y, 'bush', x, v, near(x, y + 5, 40)]);
    for (const [x, y, v] of map.trees) if (inView(x, y, 160)) tops.push([y, 'tree', x, v, near(x, y - 30, 70)]);
    tops.sort((a, b) => a[0] - b[0]);
    for (const [y, type, x, v, fade] of tops) {
      const s = HSThemes.sprite(map.theme, type, v);
      ctx.globalAlpha = fade ? .42 : 1;
      ctx.drawImage(s.c, x - s.ox, y - s.oy, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    labels.forEach(f => f());

    // hiệu ứng
    fx = fx.filter(f => (f.life -= dt) > 0);
    for (const f of fx) {
      if (f.kind === 'splash') {
        const p = 1 - f.life / .5;
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#5ab8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + 12, 8 + p * 22, 3 + p * 8, 0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 5; i++) { const a = -Math.PI * (i + .5) / 5; dot(ctx, f.x + Math.cos(a) * p * 22, f.y + 6 + Math.sin(a) * p * 26 + p * p * 20, 3, '#9fe3ff'); }
        ctx.restore(); continue;
      }
      const al = Math.min(1, f.life * 3);
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(74,59,82,${al * .5})`; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(110,200,255,${al})`; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 1; i <= 6; i++) { const p = i / 7, w = Math.sin(sec * 30 + i) * 4; dot(ctx, f.x1 + (f.x2 - f.x1) * p + w, f.y1 + (f.y2 - f.y1) * p - w, 2.5 * al, '#e6f7ff'); }
      ctx.restore();
    }
    rings = rings.filter(r => (r.life -= dt) > 0);
    for (const r of rings) {
      ctx.save(); ctx.strokeStyle = '#8f7bff'; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) { const p = ((1.2 - r.life) / 1.2 + i * .25) % 1; ctx.globalAlpha = (1 - p) * .8; ctx.beginPath(); ctx.arc(r.x, r.y, 20 + p * 120, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    floats = floats.filter(f => (f.life -= dt) > 0);
    for (const f of floats) {
      f.y -= dt * 32;
      ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = '800 24px "Baloo 2",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y);
      const w = ctx.measureText(f.txt).width;
      if (f.heart) heart(ctx, f.x + w / 2 + 14, f.y, 1.3);
      if (f.stars) { star(ctx, f.x - w / 2 - 14, f.y, 9, '#ffd36e'); star(ctx, f.x + w / 2 + 14, f.y, 9, '#ffd36e'); }
      ctx.restore();
    }
    bubbles = bubbles.filter(b => (b.life -= dt) > 0);
    for (const b of bubbles) if (inView(b.x, b.y)) bubble(ctx, b.x, b.y - (1.7 - b.life) * 8, b.txt, Math.min(1, b.life * 3), b.angry);
    if (aim && role === 'seeker' && A.isTouch && me.alive) { // điểm ngắm trên cảm ứng
      ctx.save(); ctx.strokeStyle = 'rgba(255,93,125,.8)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 14, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.restore();

    // tâm ngắm (chuột)
    if (role === 'seeker' && me.alive && snap.ph === 'playing' && !A.isTouch) {
      const mx = mouse.x, my = mouse.y;
      ctx.save(); ctx.lineCap = 'round';
      for (const [col, w] of [[INK, 6], ['#fff', 3]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(mx, my, 13, 0, TAU);
        ctx.moveTo(mx - 22, my); ctx.lineTo(mx - 17, my); ctx.moveTo(mx + 17, my); ctx.lineTo(mx + 22, my);
        ctx.moveTo(mx, my - 22); ctx.lineTo(mx, my - 17); ctx.moveTo(mx, my + 17); ctx.lineTo(mx, my + 22); ctx.stroke();
      }
      dot(ctx, mx, my, 3, '#ff6b8b');
      ctx.restore();
    }
    // cần gạt ảo
    if (joy) {
      const dx = joy.x - joy.bx, dy = joy.y - joy.by, l = Math.hypot(dx, dy), k2 = l > 50 ? 50 / l : 1;
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = INK;
      ctx.globalAlpha = .5; circ(ctx, joy.bx, joy.by, 56, 'rgba(255,250,242,.6)');
      ctx.globalAlpha = .95; circ(ctx, joy.bx + dx * k2, joy.by + dy * k2, 26, touchRun || keys.run ? '#ff8fb1' : '#fffaf2');
      ctx.restore();
    } else if (A.isTouch && me.alive && !(role === 'seeker' && snap.ph === 'hiding')) {
      ctx.save(); ctx.globalAlpha = .35; ctx.lineWidth = 3; ctx.strokeStyle = INK;
      const bx = 90, by = vh - 110;
      circ(ctx, bx, by, 50, 'rgba(255,250,242,.5)'); circ(ctx, bx, by, 22, '#fffaf2');
      ctx.restore();
    }

    // màn đếm: người tìm bị che mắt
    if (snap.ph === 'hiding') {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      if (role === 'seeker') {
        ctx.fillStyle = 'rgba(74,59,82,.94)'; ctx.fillRect(0, 0, vw, vh);
        const s = Math.min(2.4, vh / 300), cy = vh / 2 - 20 * s;
        drawFarmer(ctx, vw / 2, cy, { scale: s, ang: .5 });
        ctx.lineWidth = 3; ctx.strokeStyle = INK; rrect(ctx, vw / 2 - 12.5 * s, cy - 48 * s, 25 * s, 8.5 * s, 4 * s, '#2d2433');
        ctx.fillStyle = '#fffaf2'; ctx.font = `800 ${Math.round(12 * s)}px "Baloo 2",sans-serif`;
        ctx.fillText('Đang nhắm mắt đếm…', vw / 2, cy + 30 * s);
        ctx.font = `800 ${Math.round(38 * s)}px "Baloo 2",sans-serif`; ctx.fillStyle = '#ffd36e';
        ctx.fillText(snap.tm, vw / 2, cy + 64 * s + Math.sin(sec * 8) * 4);
      } else {
        const txt = `Mau trốn vào đàn thú! ${snap.tm}`;
        ctx.font = `800 ${vw < 600 ? 20 : 28}px "Baloo 2",sans-serif`;
        ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(txt, vw / 2, vw < 600 ? 120 : 92);
        ctx.fillStyle = '#ff8fb1'; ctx.fillText(txt, vw / 2, vw < 600 ? 120 : 92);
      }
      ctx.restore();
    }

    // minimap: địa hình, mình, đồng đội, người tìm (không lộ thú)
    const blind = role === 'seeker' && snap.ph === 'hiding';
    mini.style.visibility = blind ? 'hidden' : 'visible';
    if (!blind) {
      const sc = mini.width / W;
      mctx.drawImage(gfx.mini, 0, 0);
      mctx.lineWidth = 3; mctx.strokeStyle = 'rgba(255,255,255,.95)';
      mctx.strokeRect(cam.x * sc, cam.y * sc, ww * sc, wh * sc);
      const pin = (x, y, col, r = 7) => { mctx.beginPath(); mctx.arc(x * sc, y * sc, r, 0, TAU); mctx.fillStyle = col; mctx.fill(); mctx.lineWidth = 3; mctx.strokeStyle = INK; mctx.stroke(); };
      for (const [eid] of mates) { const d = disp.get(eid); if (d && eid !== me.eid) pin(d.x, d.y, '#7fd6a6', 6); }
      for (const s of snap.k) if (s[6]) pin(s[2], s[3], '#8f7bff', 8);
      if (me.alive && me.role === 'hider') { const d = disp.get(me.eid); if (d) pin(d.x, d.y, '#ff8fb1', 8); }
    }
  }

  registerGame('hideseek', { thumb, mount, onMsg, unmount });
})();
