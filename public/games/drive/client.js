// Lái Mò — client. Hoa tiêu thấy bản đồ, tài xế chỉ thấy kính mờ + bảng đồng hồ.
(() => {
  // ================== TÍN HIỆU ==================
  const SIG = [
    { label: 'Trái', key: 'A', codes: ['KeyA', 'ArrowLeft'], col: '#9fd8ff', tone: 520 },
    { label: 'Phải', key: 'D', codes: ['KeyD', 'ArrowRight'], col: '#9fd8ff', tone: 660 },
    { label: 'Thẳng', key: 'W', codes: ['KeyW', 'ArrowUp'], col: '#a6e8b8', tone: 780 },
    { label: 'Ga!', key: 'E', codes: ['KeyE'], col: '#c9f29b', tone: 900 },
    { label: 'Chậm', key: 'Q', codes: ['KeyQ'], col: '#ffd59a', tone: 440 },
    { label: 'Phanh', key: 'S', codes: ['KeyS', 'ArrowDown'], col: '#ffa3a3', tone: 330 },
    { label: 'Lùi', key: 'R', codes: ['KeyR'], col: '#e2d6ff', tone: 380 },
    { label: 'Đỗ', key: 'Space', codes: ['Space'], col: '#d7c4ff', tone: 600 },
  ];
  const BIG = ['RẼ TRÁI!', 'RẼ PHẢI!', 'ĐI THẲNG', 'TĂNG GA!', 'CHẬM LẠI', 'PHANH!', 'LÙI LẠI', 'ĐỖ XE!'];

  // ================== GIAO DIỆN TỪNG BẢN ĐỒ ==================
  const THEME = {
    country: {
      name: 'Đồng quê', ground: '#a6e08f', blob: '#b8eaa0', road: '#a09cb8', shoulder: '#e9dcb4', line: '#fff',
      fog: ['#e8f3ff', '#cfe3f0'], mini: '#8ccf78', dens: 1,
      decor: ['tree', 'tree', 'tree', 'bush', 'flower', 'flower', 'hay', 'rock'],
    },
    snow: {
      name: 'Đèo tuyết', ground: '#eef5ff', blob: '#ffffff', road: '#8f9cba', shoulder: '#ffffff', line: '#ffe27a',
      fog: ['#f4f8ff', '#d9e6f7'], mini: '#d6e6f7', dens: 1,
      decor: ['pine', 'pine', 'pine', 'snowman', 'snowrock', 'gift', 'pine'],
    },
    beach: {
      name: 'Phố biển', ground: '#ffe6a8', blob: '#fff0c4', road: '#a7a3bd', shoulder: '#fff6dc', line: '#fff',
      fog: ['#fff6e2', '#ffe1cc'], mini: '#f6d98c', dens: .9, sea: true,
      decor: ['palm', 'palm', 'umbrella', 'castle', 'shell', 'ball', 'palm'],
    },
    night: {
      name: 'Phố đêm', ground: '#4d5384', blob: '#565d93', road: '#33365a', shoulder: '#6c7099', line: '#ffd36e',
      fog: ['#3b3f6b', '#262947'], mini: '#3f4473', dens: .8, dark: true,
      decor: ['house', 'house', 'house', 'tree', 'bench', 'house'],
    },
  };

  const KEY_DRV = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyW: 'g', ArrowUp: 'g', KeyS: 'b', ArrowDown: 'b', Space: 'b' };

  let A, root, cv, ctx, mini, mctx, el = {};
  let map, role, info, snap, prevSnap, look, raf, inputTimer, resTimer, readyTimer;
  let disp, camA, vw, vh, Z, dpr, decor, minis, keys, held, lastIn, sigs, sent, floats, flash, shake, puffs, lastT, beepT, rotate, hudKey;
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const lerpA = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; };

  // ================== ẢNH BÌA ==================
  function thumb(c, w, h, t) {
    c.fillStyle = '#a6e08f'; c.fillRect(0, 0, w, h);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const road = () => { c.beginPath(); c.moveTo(-10, h * .85); c.bezierCurveTo(w * .3, h * .85, w * .35, h * .15, w * .65, h * .2); c.bezierCurveTo(w * .85, h * .25, w * .9, h * .7, w + 10, h * .6); };
    const k = h / 96;
    road(); c.strokeStyle = INK; c.lineWidth = 34 * k; c.stroke();
    road(); c.strokeStyle = '#a09cb8'; c.lineWidth = 29 * k; c.stroke();
    road(); c.strokeStyle = '#fff'; c.lineWidth = 2.5 * k; c.setLineDash([8 * k, 8 * k]); c.lineDashOffset = -t * 30; c.stroke(); c.setLineDash([]);
    if (h < 50) { drawCar(c, w / 2, h / 2, -0.5 + Math.sin(t) * .2, .8, 0); return; }
    drawAnimal(c, 1, w * .78, h * .5, { scale: .8 * k, phase: t * 2 });
    const u = (t * .25) % 1;
    drawCar(c, w * (.1 + u * .6), h * (.8 - Math.sin(u * Math.PI) * .55), -Math.PI / 2 + (u - .5) * 2.4, .95 * k, 2);
  }

  // ================== MOUNT / UNMOUNT ==================
  function mount(r, api) {
    A = api; root = r;
    root.innerHTML = `
      <div class="dr${A.isTouch ? ' touch' : ''}">
        <canvas class="dr-cv"></canvas>
        <div class="dr-hud">
          <div class="dr-l"><div class="chip role"></div><div class="dr-hp"></div></div>
          <div class="dr-m"><div class="chip time"><svg class="i"><use href="#i-clock"/></svg><span class="tt">0:00</span></div><div class="rtag"></div></div>
          <div class="dr-r"><div class="chip np pk"></div><div class="chip np co"></div></div>
        </div>
        <canvas class="dr-mini"></canvas>
        <button class="dr-rot" title="Xoay bản đồ theo xe"></button>
        <div class="dr-sigs"></div>
        <div class="dr-pad">
          <div class="grp"><button class="pb" data-k="l"><svg viewBox="0 0 24 24" class="i"><path d="M15 5l-7 7 7 7"/></svg></button><button class="pb" data-k="r"><svg viewBox="0 0 24 24" class="i"><path d="M9 5l7 7-7 7"/></svg></button></div>
          <div class="grp"><button class="pb brk" data-k="b"><b>Phanh</b></button><button class="pb gas" data-k="g"><b>Ga</b></button></div>
        </div>
        <div class="dr-keys"></div>
        <div class="dr-ov"><div class="card"><div class="ovbig"></div><h2></h2><p class="sub ovsub"></p><div class="ovbody"></div><p class="sub ovnext"></p></div></div>
      </div>`;
    const q = s => root.querySelector(s);
    el = {
      wrap: q('.dr'), role: q('.role'), hp: q('.dr-hp'), tt: q('.tt'), time: q('.time'), rtag: q('.rtag'), pk: q('.pk'), co: q('.co'),
      sigs: q('.dr-sigs'), pad: q('.dr-pad'), keys: q('.dr-keys'), ov: q('.dr-ov'), rot: q('.dr-rot'),
    };
    cv = q('.dr-cv'); ctx = cv.getContext('2d');
    mini = q('.dr-mini'); mctx = mini.getContext('2d');
    map = role = info = snap = prevSnap = null;
    keys = { l: 0, r: 0, g: 0, b: 0 }; held = { l: 0, r: 0, g: 0, b: 0 }; lastIn = '';
    sigs = []; sent = null; floats = []; flash = 0; shake = 0; puffs = []; lastT = performance.now(); beepT = 0; hudKey = '';
    rotate = store.get('drRotate', true);
    disp = { x: 0, y: 0, a: 0 }; camA = 0;

    // nút tín hiệu cho hoa tiêu
    SIG.forEach((s, k) => {
      const b = document.createElement('button');
      b.className = 'sg'; b.style.background = s.col;
      b.innerHTML = `<canvas width="56" height="56"></canvas><b>${s.label}</b>${A.isTouch ? '' : `<kbd>${s.key === 'Space' ? '␣' : s.key}</kbd>`}`;
      drawSigIcon(b.querySelector('canvas').getContext('2d'), k, 28, 28, .9, 2);
      on(b, 'pointerdown', e => { e.preventDefault(); sendSig(k); });
      el.sigs.append(b);
    });
    // nút lái cho tài xế (giữ để lái, nhiều ngón cùng lúc)
    for (const b of el.pad.querySelectorAll('.pb')) {
      const k = b.dataset.k;
      const down = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} held[k] = 1; b.classList.add('on'); pushInput(); };
      const up = () => { held[k] = 0; b.classList.remove('on'); pushInput(); };
      on(b, 'pointerdown', down); on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'lostpointercapture', up);
      on(b, 'contextmenu', e => e.preventDefault());
    }
    on(el.rot, 'click', () => { rotate = !rotate; store.set('drRotate', rotate); A.sfx.click(); setRotBtn(); });
    setRotBtn();

    on(window, 'resize', resize);
    on(window, 'keydown', onKey);
    on(window, 'keyup', e => { const k = KEY_DRV[e.code]; if (k && keys[k]) { keys[k] = 0; pushInput(); } });
    on(window, 'blur', () => { for (const k in keys) keys[k] = held[k] = 0; pushInput(); });
    on(cv, 'contextmenu', e => e.preventDefault());
    inputTimer = setInterval(pushInput, 100);
    resize();
    raf = requestAnimationFrame(frame);
  }
  function unmount() {
    cancelAnimationFrame(raf);
    clearInterval(inputTimer); clearInterval(resTimer); clearInterval(readyTimer);
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
  }
  function setRotBtn() {
    el.rot.innerHTML = `<svg viewBox="0 0 24 24" class="i"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/></svg><b>${rotate ? 'Xoay theo xe' : 'Bắc ở trên'}</b>`;
    el.rot.classList.toggle('on', rotate);
  }

  // ================== ĐIỀU KHIỂN ==================
  function onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (role === 'driver') {
      const k = KEY_DRV[e.code];
      if (k) { e.preventDefault(); if (!keys[k]) { keys[k] = 1; pushInput(); } }
    } else if (role === 'nav' && !e.repeat) {
      const k = SIG.findIndex(s => s.codes.includes(e.code));
      if (k >= 0) { e.preventDefault(); sendSig(k); }
      else if (e.code === 'KeyT') el.rot.click();
    }
  }
  function pushInput() {
    if (role !== 'driver') return;
    const l = keys.l || held.l, r = keys.r || held.r;
    const d = { t: 'in', s: (r ? 1 : 0) - (l ? 1 : 0), g: keys.g || held.g ? 1 : 0, b: keys.b || held.b ? 1 : 0 };
    const j = JSON.stringify(d);
    if (j !== lastIn || Math.random() < .1) { lastIn = j; A.send(d); }
  }
  function sendSig(k) {
    if (role !== 'nav') return;
    A.send({ t: 'sig', k });
    A.vibrate(15);
    const b = el.sigs.children[k];
    if (b) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
  }

  // ================== TIN NHẮN ==================
  function onMsg(d) {
    switch (d.t) {
      case 'init': {
        map = d.map; role = d.role; info = d; snap = prevSnap = null;
        sigs = []; sent = null; floats = []; flash = 0;
        for (const k in keys) keys[k] = held[k] = 0;
        buildDecor();
        const p0 = map.pts[0], p1 = map.pts[3];
        disp = { x: p0[0], y: p0[1], a: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) };
        camA = -Math.PI / 2 - disp.a;
        el.wrap.classList.toggle('is-driver', role === 'driver');
        el.wrap.classList.toggle('is-nav', role === 'nav');
        el.wrap.classList.toggle('is-watch', role === 'watch');
        el.rtag.textContent = `Màn ${d.lv + 1}/${d.levels} · ${THEME[map.theme].name}`;
        el.keys.innerHTML = role === 'driver' ? '<span><kbd>A</kbd><kbd>D</kbd> đánh lái</span><span><kbd>W</kbd> ga</span><span><kbd>S</kbd>/<kbd>␣</kbd> phanh, lùi</span>'
          : role === 'nav' ? '<span>Bấm phím trên nút để gửi tín hiệu</span><span><kbd>T</kbd> xoay bản đồ</span>' : '';
        const dn = A.player(d.driver), nn = A.player(d.nav);
        el.role.innerHTML = '';
        el.role.append(avatar(A.player(A.myId)?.av ?? 0, 34));
        el.role.insertAdjacentHTML('beforeend', role === 'driver' ? 'Bạn cầm lái' : role === 'nav' ? 'Bạn chỉ đường' : 'Đang xem');
        hudKey = '';
        if (d.ph === 'ready') showReady(d, dn, nn); else { clearInterval(readyTimer); overlay(false); } // vào lại giữa chừng thì không đếm ngược nữa
        A.beep(role === 'driver' ? 330 : 660, .3, 'triangle', .14, 200);
        A.vibrate(60);
        resize();
        break;
      }
      case 's': prevSnap = snap; snap = d; onSnap(d); break;
      case 'sig': gotSig(d.k); break;
      case 'sent': sent = { k: d.k, t: 0 }; A.beep(SIG[d.k].tone, .07, 'triangle', .06); break;
      case 'fx':
        if (d.k === 'hurt') {
          floats.push({ x: d.x, y: d.y - 30, txt: d.why === 'lost' ? 'Lạc đường! −1' : '−1 tim', col: '#ff5d7d', t: 0 });
          flash = 1; shake = 1;
          A.sfx.lose(); A.vibrate([90, 50, 90]);
        } else if (d.k === 'pick') {
          const s = map.stops[d.i];
          floats.push({ x: s.ax, y: s.ay - 50, txt: `Đón ${ANIMAL_NAMES[d.kind]}!`, col: '#4fb383', t: 0 });
          A.sfx.win(); A.vibrate(40);
        }
        break;
      case 'result': showResult(d); break;
    }
  }

  let lastCoins = 0;
  function onSnap(m) {
    if (m.co > lastCoins) A.beep(1200, .06, 'triangle', .06, 400);
    lastCoins = m.co;
    const key = [m.hp, m.pk, m.co, Math.ceil(m.tm), m.ph].join();
    if (key === hudKey) return;
    hudKey = key;
    const sec = Math.ceil(Math.max(0, m.tm));
    el.tt.textContent = m.ph === 'ready' ? 'Sẵn sàng' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    el.time.classList.toggle('warn', m.ph === 'drive' && m.tm <= 10);
    el.hp.innerHTML = '';
    for (let i = 0; i < info.hearts; i++) el.hp.insertAdjacentHTML('beforeend', `<svg class="i f${i < m.hp ? '' : ' lost'}"><use href="#i-heart"/></svg>`);
    el.pk.innerHTML = `${ICON_RIDER}<span>${m.pk}/${map.stops.length}</span>`;
    el.co.innerHTML = `<i class="coin"></i><span>${m.co}</span>`;
  }
  const ICON_RIDER = '<svg viewBox="0 0 24 24" class="i"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

  function gotSig(k) {
    sigs.unshift({ k, t: 0 });
    if (sigs.length > 5) sigs.length = 5;
    const s = SIG[k];
    A.beep(s.tone, .12, 'triangle', .16, k === 5 ? -150 : 120);
    setTimeout(() => A.beep(s.tone * 1.25, .1, 'triangle', .12), 110);
    A.vibrate(k === 5 ? [60, 40, 60] : 35);
  }

  // ================== OVERLAY ==================
  function overlay(on2) { el.ov.classList.toggle('on', on2); }
  function showReady(d, dn, nn) {
    clearInterval(resTimer); clearInterval(readyTimer);
    const box = el.ov, big = box.querySelector('.ovbig');
    big.innerHTML = '';
    if (dn) big.append(avatar(dn.av, 76));
    big.insertAdjacentHTML('beforeend', '<span class="ovcar"></span>');
    if (nn) big.append(avatar(nn.av, 76));
    const car = big.querySelector('.ovcar'), cc = document.createElement('canvas'), s = Math.min(2, devicePixelRatio || 1);
    cc.width = cc.height = 70 * s; cc.style.width = cc.style.height = '70px';
    const x = cc.getContext('2d'); x.scale(s, s); drawCar(x, 35, 35, -Math.PI / 2, 1.1, 0); car.append(cc);
    box.querySelector('h2').textContent = `Màn ${d.lv + 1} · ${THEME[d.map.theme].name}`;
    box.querySelector('.ovsub').textContent = role === 'driver' ? `Bạn cầm lái nhưng kính mờ hết rồi! Nghe ${nn ? nn.name : 'bạn'} chỉ đường nhé.`
      : role === 'nav' ? `Bạn chỉ đường cho ${dn ? dn.name : 'bạn'}. Đón ${d.map.stops.length} bé khách rồi về đích!` : `${dn ? dn.name : '?'} lái, ${nn ? nn.name : '?'} chỉ đường`;
    box.querySelector('.ovbody').innerHTML = role === 'nav'
      ? '<div class="tips"><span>Dừng xe sát trạm để khách lên</span><span>Tránh cọc, vũng trơn và thú băng qua đường</span><span>Đang gọi nhau thì cứ nói to!</span></div>'
      : role === 'driver' ? '<div class="tips"><span>Đèn va chạm sáng và kêu tít tít khi sắp đâm</span><span>Xe rung là đang chạy ra ngoài cỏ</span></div>' : '';
    let n = 3;
    const nx = box.querySelector('.ovnext');
    nx.innerHTML = `<b class="count">${n}</b>`;
    overlay(true);
    readyTimer = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(readyTimer); overlay(false); A.beep(880, .25, 'triangle', .15, 200); return; }
      nx.innerHTML = `<b class="count">${n}</b>`; A.beep(440, .1, 'triangle', .1);
    }, 1000);
  }
  function starRow(n, size = 30) {
    const c = document.createElement('canvas'), s = Math.min(2, devicePixelRatio || 1), w = size * 3 + 16;
    c.width = w * s; c.height = size * s; c.style.width = w + 'px'; c.style.height = size + 'px';
    const x = c.getContext('2d'); x.scale(s, s);
    for (let i = 0; i < 3; i++) star(x, size / 2 + i * (size + 8), size / 2 + 1, size * .45, i < n ? '#ffd36e' : '#e9e1ef');
    return c;
  }
  function showResult(d) {
    clearInterval(resTimer); clearInterval(readyTimer);
    const box = el.ov, big = box.querySelector('.ovbig');
    big.innerHTML = '';
    if (d.last) {
      const totStars = d.all.reduce((a, r) => a + r.stars, 0), max = d.all.length * 3;
      big.append(starRow(Math.round(totStars / max * 3), 40));
      box.querySelector('h2').textContent = totStars >= max * .7 ? 'Cặp đôi ăn ý!' : totStars >= max * .4 ? 'Cũng hợp nhau đó!' : 'Cần tập thêm nha!';
      box.querySelector('.ovsub').textContent = `Tổng ${d.total} điểm · ${totStars}/${max} sao`;
      box.querySelector('.ovbody').innerHTML = d.all.map(r => {
        const p = A.player(r.driver);
        return `<div class="rl"><span class="rank">${r.lv + 1}</span><span class="nm">${THEME[r.theme].name}<small>${A.esc(p ? p.name : '?')} lái · ${r.picked}/${r.stops} khách</small></span><span class="st">${'<i class="s on"></i>'.repeat(r.stars)}${'<i class="s"></i>'.repeat(3 - r.stars)}</span><span class="tot">${r.score}</span></div>`;
      }).join('');
      (totStars >= max * .4 ? A.sfx.win : A.sfx.lose)();
    } else {
      big.append(starRow(d.stars));
      box.querySelector('h2').textContent = d.done ? (d.stars === 3 ? 'Tuyệt vời!' : 'Về đích rồi!') : d.why === 'crash' ? 'Xe hỏng mất rồi!' : 'Hết giờ!';
      box.querySelector('.ovsub').textContent = `Màn ${d.lv + 1} · ${THEME[d.theme].name}`;
      box.querySelector('.ovbody').innerHTML = `<div class="stats">
        <div><b>${d.picked}/${d.stops}</b><small>khách</small></div>
        <div><b>${d.coins}</b><small>xu</small></div>
        <div><b>${d.hp}</b><small>tim còn</small></div>
        <div><b>+${d.score}</b><small>điểm</small></div></div>
        <p class="sub">Tổng đội: <b>${d.total}</b> điểm</p>`;
      (d.done ? A.sfx.win : A.sfx.lose)();
    }
    let w = d.wait;
    const nx = box.querySelector('.ovnext');
    const tick = () => { nx.textContent = d.last ? `Về phòng chờ sau ${w} giây…` : `Đổi vai! Màn tiếp theo sau ${w} giây…`; w--; };
    tick(); resTimer = setInterval(tick, 1000);
    overlay(true);
  }

  // ================== TRANG TRÍ (sinh từ seed giống nhau ở mọi máy) ==================
  function buildDecor() {
    const R = mulberry(map.seed), th = THEME[map.theme], pts = map.pts;
    decor = []; minis = [];
    const n = Math.round(map.W * map.H / 16000 * th.dens);
    const farFromRoad = (x, y, pad) => { for (let i = 0; i < pts.length; i += 2) { const dx = pts[i][0] - x, dy = pts[i][1] - y; if (dx * dx + dy * dy < pad * pad) return false; } return true; };
    for (let i = 0; i < n; i++) {
      const x = R() * map.W, y = R() * map.H, type = th.decor[R() * th.decor.length | 0];
      if (th.sea && x < 300) continue;
      const pad = map.rw + (type === 'house' ? 110 : type === 'tree' || type === 'pine' || type === 'palm' ? 70 : 40);
      if (!farFromRoad(x, y, pad)) continue;
      decor.push({ x, y, type, v: R(), s: .8 + R() * .5 });
    }
    // đèn đường cho phố đêm
    if (th.dark) for (let i = 6; i < pts.length - 2; i += 9) {
      const p = pts[i], q = pts[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2 * ((i / 9 | 0) % 2 ? 1 : -1);
      decor.push({ x: p[0] + Math.cos(a) * (map.rw + 22), y: p[1] + Math.sin(a) * (map.rw + 22), type: 'lamp', v: 0, s: 1 });
    }
    // vết loang trên mặt đất
    for (let i = 0; i < n * .8; i++) minis.push([R() * map.W, R() * map.H, 30 + R() * 70, 14 + R() * 30]);
    decor.sort((a, b) => a.y - b.y);
    // bản đồ thu nhỏ
    const mw = 120, mh = Math.min(200, Math.round(mw * map.H / map.W));
    const sc = Math.min(mw / map.W, mh / map.H);
    mini.width = mw * 2; mini.height = mh * 2; mini.style.width = mw + 'px'; mini.style.height = mh + 'px';
    mini._sc = sc; mini._w = mw; mini._h = mh;
    mini.style.background = th.mini;
  }

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = vw * dpr; cv.height = vh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Z = Math.max(.55, Math.min(1.15, Math.min(vw, vh) / 680));
  }

  // ================== VẼ ==================
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    const t = now / 1000;
    if (!map) { ctx.fillStyle = '#a6e08f'; ctx.fillRect(0, 0, vw, vh); return; }
    if (snap) {
      const [x, y, a] = snap.car, k = Math.min(1, dt * 14);
      disp.x += (x - disp.x) * k; disp.y += (y - disp.y) * k; disp.a = lerpA(disp.a, a, k);
      if (Math.hypot(x - disp.x, y - disp.y) > 200) { disp.x = x; disp.y = y; disp.a = a; }
    }
    flash = Math.max(0, flash - dt * 2); shake = Math.max(0, shake - dt * 2.5);
    for (const f of floats) f.t += dt;
    floats = floats.filter(f => f.t < 1.6);
    for (const s of sigs) s.t += dt;
    if (sent) sent.t += dt;
    if (role === 'driver') drawDriver(dt, t);
    else drawNav(dt, t);
  }

  // ---------- màn hình hoa tiêu ----------
  function drawNav(dt, t) {
    const th = THEME[map.theme], c = ctx;
    const target = rotate ? -Math.PI / 2 - disp.a : 0;
    camA = lerpA(camA, target, Math.min(1, dt * 3));
    const ahead = 140;
    const fx = disp.x + Math.cos(disp.a) * ahead, fy = disp.y + Math.sin(disp.a) * ahead;
    c.save();
    c.fillStyle = th.ground; c.fillRect(0, 0, vw, vh);
    const cy = role === 'nav' ? vh * .46 : vh * .5;
    c.translate(vw / 2, cy); c.scale(Z, Z); c.rotate(camA); c.translate(-fx, -fy);
    const rad = Math.hypot(vw, vh) / Z / 2 + 60;
    const vis = (x, y, p = 0) => Math.abs(x - fx) < rad + p && Math.abs(y - fy) < rad + p;

    c.fillStyle = th.blob;
    for (const [x, y, rx, ry] of minis) if (vis(x, y, rx)) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
    if (th.sea) drawSea(c, t);
    // trang trí phẳng nằm dưới đường
    for (const d of decor) if (vis(d.x, d.y, 80) && FLAT[d.type]) DECOR[d.type](c, d, t);
    drawRoad(c, th, fx, fy, rad);
    // vũng trơn
    for (const s of map.slicks) if (vis(s[0], s[1], 80)) drawSlick(c, map.theme, s, t);
    // xu
    const got = new Set(snap ? snap.got : []);
    map.coins.forEach(([x, y], i) => { if (!got.has(i) && vis(x, y)) drawCoin(c, x, y, t + i * .3); });
    // vạch đích
    drawFinish(c);
    // các vật có chiều cao, sắp theo y
    const items = [];
    for (const d of decor) if (!FLAT[d.type] && vis(d.x, d.y, 120)) items.push([d.y, () => DECOR[d.type](c, d, t)]);
    const kn = new Set(snap ? snap.kn : []);
    map.cones.forEach(([x, y], i) => { if (vis(x, y)) items.push([y, () => drawObstacle(c, map.theme, x, y, kn.has(i), camA)]); });
    map.stops.forEach((s, i) => {
      const stv = snap ? snap.stops[i] : 0;
      if (!vis(s.ax, s.ay, 60)) return;
      items.push([s.ay, () => drawStop(c, s, stv, t)]);
    });
    if (snap) snap.cr.forEach(([x, y, dirn, flee], i) => {
      if (!vis(x, y)) return;
      const cr = map.crossers[i];
      items.push([y, () => upright(c, x, y, () => drawAnimal(c, cr.kind, 0, 0, { scale: 1.15, moving: !!dirn || flee, phase: t * 10, flip: dirn < 0 ? 0 : 1, stun: flee, time: t }))]);
    });
    items.push([disp.y, () => {
      if (snap && snap.inv && (t * 10 | 0) % 2) return;
      drawCar(c, disp.x, disp.y, disp.a, 1.15, snap ? snap.pk : 0, snap && snap.car[3] > 0 ? t : 0, snap ? snap.st : 0);
    }]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, f] of items) f();
    if (th.dark) drawNightLights(c, fx, fy, rad);
    // chữ nổi
    for (const f of floats) upright(c, f.x, f.y - f.t * 40, () => label(c, 0, 0, f.txt, f.col, 1 - Math.max(0, f.t - 1) / .6, 18));
    c.restore();

    // tín hiệu vừa gửi (hiện trên đầu xe)
    if (sent && sent.t < 1.2 && role === 'nav') {
      const a = 1 - Math.max(0, sent.t - .8) / .4, s = .8 + Math.min(1, sent.t * 6) * .25;
      c.save(); c.globalAlpha = a; c.translate(vw / 2, cy - 90 * Z); c.scale(s, s);
      drawSigIcon(c, sent.k, 0, 0, 1.1, 0); c.restore();
    }
    drawMini(t);
    if (flash) { c.fillStyle = `rgba(255,93,125,${flash * .3})`; c.fillRect(0, 0, vw, vh); }
  }
  function upright(c, x, y, f) { c.save(); c.translate(x, y); c.rotate(-camA); f(); c.restore(); }

  function drawRoad(c, th, fx, fy, rad) {
    const pts = map.pts, rw = map.rw;
    let lo = pts.length, hi = -1;
    for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i][0] - fx) < rad + rw && Math.abs(pts[i][1] - fy) < rad + rw) { lo = Math.min(lo, i); hi = i; }
    if (hi < 0) return;
    lo = Math.max(0, lo - 2); hi = Math.min(pts.length - 1, hi + 2);
    const path = () => { c.beginPath(); c.moveTo(pts[lo][0], pts[lo][1]); for (let i = lo + 1; i <= hi; i++) c.lineTo(pts[i][0], pts[i][1]); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    path(); c.strokeStyle = INK; c.lineWidth = rw * 2 + 30; c.stroke();
    path(); c.strokeStyle = th.shoulder; c.lineWidth = rw * 2 + 24; c.stroke();
    path(); c.strokeStyle = INK; c.lineWidth = rw * 2 + 5; c.stroke();
    path(); c.strokeStyle = th.road; c.lineWidth = rw * 2; c.stroke();
    path(); c.strokeStyle = th.line; c.lineWidth = 4; c.setLineDash([22, 22]); c.stroke(); c.setLineDash([]);
    // vạch xuất phát
    if (lo === 0) { const p = pts[0], q = pts[2], a = Math.atan2(q[1] - p[1], q[0] - p[0]); c.save(); c.translate(p[0], p[1]); c.rotate(a); c.fillStyle = '#fff'; c.fillRect(-4, -rw, 8, rw * 2); c.restore(); }
  }
  function drawFinish(c) {
    const pts = map.pts, n = pts.length - 1, p = pts[n - 1], q = pts[n], a = Math.atan2(q[1] - p[1], q[0] - p[0]), rw = map.rw;
    c.save(); c.translate(q[0], q[1]); c.rotate(a);
    const sq = 12;
    for (let i = 0; i < 2; i++) for (let j = -rw; j < rw; j += sq) { c.fillStyle = ((j / sq | 0) + i) % 2 ? INK : '#fff'; c.fillRect(-sq + i * sq, j, sq, Math.min(sq, rw - j)); }
    c.lineWidth = 2.5; c.strokeStyle = INK;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(0, s * (rw + 14)); c.lineTo(0, s * (rw + 14) - 1); c.stroke();
      circ(c, 0, s * (rw + 16), 6, '#ff8fb1');
    }
    c.restore();
    upright(c, q[0], q[1], () => label(c, 0, -rw - 30, 'ĐÍCH', '#e46a92', 1, 18));
  }
  function drawStop(c, s, st, t) {
    upright(c, s.ax, s.ay, () => {
      if (st < 2) {
        c.lineWidth = 2.5; c.strokeStyle = INK;
        rrect(c, -3, -54, 6, 54, 3, '#fff');
        rrect(c, -22, -76, 44, 26, 9, '#7cc7ff');
        c.fillStyle = INK; c.font = '800 13px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('TRẠM', 0, -63);
        drawAnimal(c, s.kind, 26, 4, { scale: 1.1, phase: t * 3 + s.i, moving: st > 0, flip: 0 });
        if (st > 0) {
          c.lineWidth = 6; c.strokeStyle = '#4fb383'; c.beginPath(); c.arc(26, -20, 26, -Math.PI / 2, -Math.PI / 2 + st * TAU); c.stroke();
        } else {
          const b = Math.sin(t * 4 + s.i) * 3;
          label(c, 26, -ANIMAL_H[s.kind] - 22 + b, 'Đợi xe!', '#4a3b52', 1, 13, '#fff');
        }
      } else {
        c.globalAlpha = .5; c.lineWidth = 2.5; c.strokeStyle = INK;
        rrect(c, -3, -54, 6, 54, 3, '#fff'); rrect(c, -22, -76, 44, 26, 9, '#cfe9d8');
        c.globalAlpha = 1;
      }
    });
    // vạch dừng trên đường
    if (st < 2) {
      c.save(); c.globalAlpha = .55 + Math.sin(t * 5) * .2;
      c.setLineDash([8, 7]); c.lineWidth = 4; c.strokeStyle = '#fff';
      c.beginPath(); c.arc(s.x, s.y, 34, 0, TAU); c.stroke(); c.restore();
    }
  }
  function label(c, x, y, txt, col, alpha = 1, size = 16, bg) {
    c.save(); c.globalAlpha = Math.max(0, alpha);
    c.font = `800 ${size}px "Baloo 2",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (bg) {
      const w = c.measureText(txt).width + 16;
      c.lineWidth = 2.5; c.strokeStyle = INK; rrect(c, x - w / 2, y - size * .75, w, size * 1.5, size * .7, bg);
      c.fillStyle = col; c.fillText(txt, x, y + 1);
    } else {
      c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y);
    }
    c.restore();
  }
  function drawCoin(c, x, y, t) {
    const s = Math.abs(Math.cos(t * 3));
    c.save(); c.translate(x, y); c.scale(Math.max(.2, s), 1);
    c.lineWidth = 2.5; c.strokeStyle = INK; circ(c, 0, 0, 10, '#ffd36e'); circ(c, 0, 0, 5.5, '#ffe9a6', false);
    c.restore();
  }
  function drawSlick(c, theme, [x, y, rx, ry, a], t) {
    const col = { country: ['#a07a55', '#b98e66'], snow: ['#c6ecff', '#e9f8ff'], beach: ['#8fd0ff', '#bfe6ff'], night: ['#24203a', '#3a2f5c'] }[theme];
    c.save(); c.translate(x, y); c.rotate(a);
    c.lineWidth = 2.5; c.strokeStyle = INK;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fillStyle = col[0]; c.fill(); c.stroke();
    c.beginPath(); c.ellipse(-rx * .2, -ry * .2, rx * .55, ry * .45, 0, 0, TAU); c.fillStyle = col[1]; c.fill();
    if (theme === 'night') { c.strokeStyle = 'rgba(160,255,230,.5)'; c.lineWidth = 3; c.beginPath(); c.ellipse(rx * .1, 0, rx * .6, ry * .5, 0, 0, Math.PI); c.stroke(); c.strokeStyle = 'rgba(255,150,220,.5)'; c.beginPath(); c.ellipse(rx * .1, 0, rx * .45, ry * .35, 0, 0, Math.PI); c.stroke(); }
    if (theme === 'snow') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(-rx * .4, -ry * .1); c.lineTo(-rx * .1, -ry * .4); c.stroke(); }
    c.restore();
  }
  function drawObstacle(c, theme, x, y, knocked, rot) {
    upright(c, x, y, () => {
      c.lineWidth = 2.4; c.strokeStyle = INK;
      if (knocked) { c.rotate(1.3); c.globalAlpha = .55; }
      shadow(c, 0, 0, 13);
      if (theme === 'country') { // kiện rơm
        rrect(c, -14, -20, 28, 20, 5, '#ffd36e');
        c.strokeStyle = '#d9a83a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, -12); c.lineTo(14, -12); c.moveTo(-14, -6); c.lineTo(14, -6); c.stroke();
        c.strokeStyle = '#c0504d'; c.beginPath(); c.moveTo(-6, -20); c.lineTo(-6, 0); c.moveTo(6, -20); c.lineTo(6, 0); c.stroke();
      } else if (theme === 'snow') { // người tuyết nhỏ
        circ(c, 0, -9, 10, '#fff'); circ(c, 0, -24, 7, '#fff');
        dot(c, -2.5, -25, 1.4, INK); dot(c, 2.5, -25, 1.4, INK);
        poly(c, [0, -23, 7, -22, 0, -21], '#ff9f43');
        rrect(c, -6, -34, 12, 5, 2, '#ff6b8b');
      } else if (theme === 'beach') { // lâu đài cát
        rrect(c, -14, -16, 28, 16, 3, '#f3c26b');
        rrect(c, -8, -28, 16, 13, 2, '#f3c26b');
        poly(c, [-4, -28, 0, -38, 4, -28], '#ff8fb1');
        c.beginPath(); c.moveTo(-14, -16); for (let i = -14; i < 14; i += 7) { c.lineTo(i, -20); c.lineTo(i + 3.5, -20); c.lineTo(i + 3.5, -16); c.lineTo(i + 7, -16); } c.stroke();
      } else { // cọc giao thông
        poly(c, [-4, -30, 4, -30, 11, -2, -11, -2], '#ff9f43');
        c.fillStyle = '#fff'; c.fillRect(-6.5, -19, 13, 5);
        rrect(c, -14, -3, 28, 5, 2, '#ff9f43');
      }
    });
  }
  function drawSea(c, t) {
    c.save();
    c.beginPath(); c.moveTo(-100, -100);
    for (let y = -100; y <= map.H + 100; y += 40) c.lineTo(250 + Math.sin(y * .01 + t * .8) * 14, y);
    c.lineTo(-100, map.H + 100); c.closePath();
    c.fillStyle = '#7fcdf5'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 5;
    c.beginPath(); for (let y = -100; y <= map.H + 100; y += 40) c.lineTo(234 + Math.sin(y * .01 + t * .8) * 14, y); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3;
    for (let i = 0; i < map.H / 160; i++) { const y = i * 160 + (t * 10) % 160, x = 80 + (i * 37) % 120; c.beginPath(); c.arc(x, y, 14, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.restore();
  }
  function drawNightLights(c, fx, fy, rad) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const d of decor) if (d.type === 'lamp' && Math.abs(d.x - fx) < rad && Math.abs(d.y - fy) < rad) {
      const g = c.createRadialGradient(d.x, d.y, 4, d.x, d.y, 110);
      g.addColorStop(0, 'rgba(255,220,140,.35)'); g.addColorStop(1, 'rgba(255,220,140,0)');
      c.fillStyle = g; c.beginPath(); c.arc(d.x, d.y, 110, 0, TAU); c.fill();
    }
    // đèn pha xe
    c.translate(disp.x, disp.y); c.rotate(disp.a);
    const g = c.createLinearGradient(20, 0, 200, 0);
    g.addColorStop(0, 'rgba(255,245,200,.35)'); g.addColorStop(1, 'rgba(255,245,200,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(20, -10); c.lineTo(200, -70); c.lineTo(200, 70); c.lineTo(20, 10); c.closePath(); c.fill();
    c.restore();
  }

  // ---------- trang trí ----------
  const FLAT = { flower: 1, rock: 1, shell: 1, snowrock: 1 };
  const DECOR = {
    tree(c, d) { const s = d.s; c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(s, s); c.lineWidth = 2.5; c.strokeStyle = INK; shadow(c, 0, 0, 26); rrect(c, -5, -22, 10, 22, 3, '#b07a52'); cloud(c, [[0, -44, 24], [-17, -32, 16], [17, -32, 16], [0, -60, 16]], map.theme === 'night' ? '#4e8f6c' : '#7fcf86'); dot(c, -8, -50, 6, map.theme === 'night' ? '#5fa47f' : '#9fe0a0'); c.restore(); },
    pine(c, d) { const s = d.s; c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(s, s); c.lineWidth = 2.5; c.strokeStyle = INK; shadow(c, 0, 0, 22); rrect(c, -4, -14, 8, 14, 2, '#a0715a'); poly(c, [0, -70, 18, -40, 10, -40, 24, -14, -24, -14, -10, -40, -18, -40], '#5fb38a'); poly(c, [0, -70, 10, -52, -10, -52], '#fff'); dot(c, -8, -24, 3, '#fff'); dot(c, 9, -30, 3, '#fff'); c.restore(); },
    palm(c, d) { const s = d.s; c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(s, s); c.lineWidth = 2.5; c.strokeStyle = INK; shadow(c, 0, 0, 22); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(8, -30, 2, -62); c.lineWidth = 11; c.stroke(); c.strokeStyle = '#c9915e'; c.lineWidth = 6.5; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = INK; for (const a of [-2.6, -1.9, -1.2, -.4, .3]) { c.save(); c.translate(2, -62); c.rotate(a); ell(c, 20, 0, 22, 7, '#6cc77a'); c.restore(); } circ(c, -2, -60, 4, '#a0715a'); circ(c, 5, -59, 4, '#a0715a'); c.restore(); },
    bush(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(d.s, d.s); c.lineWidth = 2.5; c.strokeStyle = INK; shadow(c, 0, 0, 20); cloud(c, [[-10, -10, 12], [8, -12, 13], [0, -20, 11]], '#8fd88a'); dot(c, -4, -14, 2.5, '#ff8fb1'); dot(c, 8, -8, 2.5, '#ffd36e'); c.restore(); },
    flower(c, d) { const col = ['#ff8fb1', '#ffd36e', '#fff', '#c4b5ff'][d.v * 4 | 0]; for (let i = 0; i < 4; i++) { const x = d.x + Math.cos(i * 2 + d.v * 9) * 14, y = d.y + Math.sin(i * 2 + d.v * 9) * 10; dot(c, x, y, 4, col); dot(c, x, y, 1.6, '#ffb84d'); } },
    rock(c, d) { c.lineWidth = 2.5; c.strokeStyle = INK; ell(c, d.x, d.y, 14 * d.s, 9 * d.s, '#c9c3d6'); dot(c, d.x - 4, d.y - 3, 3, '#e3dfeb'); },
    snowrock(c, d) { c.lineWidth = 2.5; c.strokeStyle = INK; ell(c, d.x, d.y, 18 * d.s, 10 * d.s, '#c6ecff'); ell(c, d.x - 3, d.y - 2, 9 * d.s, 4 * d.s, '#e9f8ff', 0, false); },
    hay(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.5; c.strokeStyle = INK; shadow(c, 0, 0, 18); ell(c, 0, -14, 18, 16, '#ffd36e'); c.strokeStyle = '#d9a83a'; c.beginPath(); c.arc(0, -14, 9, 0, 5); c.stroke(); c.restore(); },
    snowman(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(d.s * 1.3, d.s * 1.3); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 14); circ(c, 0, -10, 12, '#fff'); circ(c, 0, -28, 9, '#fff'); dot(c, -3, -30, 1.6, INK); dot(c, 3, -30, 1.6, INK); poly(c, [0, -28, 9, -27, 0, -25], '#ff9f43'); rrect(c, -7, -40, 14, 5, 2, '#7b9cff'); c.restore(); },
    gift(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 12); rrect(c, -10, -18, 20, 18, 3, ['#ff8fb1', '#7fd6a6', '#9fd8ff'][d.v * 3 | 0]); c.fillStyle = '#ffd36e'; c.fillRect(-2, -18, 4, 18); c.restore(); },
    umbrella(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 24); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -40); c.stroke(); const col = ['#ff8fb1', '#7fd6a6', '#9fd8ff', '#ffd36e'][d.v * 4 | 0]; c.beginPath(); c.moveTo(-28, -38); c.quadraticCurveTo(0, -66, 28, -38); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-8, -40); c.quadraticCurveTo(0, -62, 8, -40); c.fill(); c.restore(); },
    castle(c, d) { drawObstacle(c, 'beach', d.x, d.y, false); },
    shell(c, d) { c.lineWidth = 2; c.strokeStyle = INK; ell(c, d.x, d.y, 7, 6, d.v < .5 ? '#ffc4d6' : '#fff'); },
    ball(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 10); circ(c, 0, -10, 10, '#fff'); c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(8, -10, 0, 0); c.fillStyle = '#ff6b8b'; c.fill(); c.stroke(); c.restore(); },
    bench(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 20); rrect(c, -20, -16, 40, 7, 3, '#c9915e'); rrect(c, -20, -26, 40, 7, 3, '#c9915e'); c.fillRect(-17, -9, 3, 9); c.fillRect(14, -9, 3, 9); c.restore(); },
    house(c, d) {
      c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.scale(d.s, d.s); c.lineWidth = 2.6; c.strokeStyle = INK;
      shadow(c, 0, 0, 46, 12);
      const col = ['#ffb3c7', '#9fd8ff', '#c4b5ff', '#ffd59a'][d.v * 4 | 0], hgt = 60 + (d.v * 7 % 1) * 40;
      rrect(c, -36, -hgt, 72, hgt, 6, col);
      for (let r = 0; r < hgt / 22 - 1; r++) for (let k = 0; k < 3; k++) {
        const lit = ((d.v * 97 + r * 3 + k) % 1.7) > .6;
        rrect(c, -26 + k * 20, -hgt + 10 + r * 22, 12, 12, 2, lit ? '#ffe27a' : '#5b5f8f');
      }
      rrect(c, -8, -18, 16, 18, 3, '#7a5a7f');
      c.restore();
    },
    lamp(c, d) { c.save(); c.translate(d.x, d.y); c.rotate(-camA); c.lineWidth = 2.4; c.strokeStyle = INK; shadow(c, 0, 0, 8); rrect(c, -2.5, -46, 5, 46, 2, '#8a8fb8'); circ(c, 0, -50, 7, '#ffe27a'); c.restore(); },
  };

  // ---------- xe ----------
  function drawCar(c, x, y, a, s, riders = 0, t = 0, steer = 0) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
    c.fillStyle = 'rgba(40,40,60,.22)'; c.beginPath(); c.roundRect(-22, -14, 48, 32, 12); c.fill();
    // bánh xe
    for (const [wx, wy] of [[-14, -16], [-14, 16], [14, -16], [14, 16]]) {
      c.save(); c.translate(wx, wy); if (wx > 0) c.rotate(steer * .4); rrect(c, -6, -3.5, 12, 7, 3, INK); c.restore();
    }
    rrect(c, -24, -16, 48, 32, 13, '#ff8fb1');
    rrect(c, 4, -12, 11, 24, 5, '#bfe6ff');           // kính trước
    rrect(c, -18, -11, 10, 22, 5, '#bfe6ff');         // kính sau
    rrect(c, -9, -13, 14, 26, 5, '#ffb3c7', false);   // nóc
    dot(c, 22, -10, 3, '#ffe27a'); dot(c, 22, 10, 3, '#ffe27a');
    dot(c, -23, -10, 2.5, '#ff5d7d'); dot(c, -23, 10, 2.5, '#ff5d7d');
    for (let i = 0; i < Math.min(4, riders); i++) dot(c, -15 + (i % 2) * 0, -6 + i * 4, 2.6, ['#ffd36e', '#7fd6a6', '#9fd8ff', '#c4b5ff'][i]);
    c.restore();
    if (t) { // khói nhỏ phía sau
      c.save(); c.globalAlpha = .45;
      const bx = x - Math.cos(a) * 30 * s, by = y - Math.sin(a) * 30 * s;
      for (let i = 0; i < 3; i++) { const p = (t * 2 + i / 3) % 1; dot(c, bx - Math.cos(a) * p * 24 + Math.sin(t * 7 + i) * 3, by - Math.sin(a) * p * 24, 4 + p * 6, '#fff'); }
      c.restore();
    }
  }

  // ---------- biểu tượng tín hiệu ----------
  function drawSigIcon(c, k, x, y, s, mode) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 3; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round';
    if (mode === 0) { circ(c, 0, 0, 30, SIG[k].col); }
    const arrow = rot => { c.save(); c.rotate(rot); poly(c, [-14, -7, 2, -7, 2, -16, 18, 0, 2, 16, 2, 7, -14, 7], '#fff'); c.restore(); };
    if (k === 0) arrow(Math.PI);
    else if (k === 1) arrow(0);
    else if (k === 2) arrow(-Math.PI / 2);
    else if (k === 3) { c.save(); c.translate(-6, 0); arrow(-Math.PI / 2); c.restore(); c.save(); c.translate(7, -3); c.scale(.7, .7); arrow(-Math.PI / 2); c.restore(); }
    else if (k === 4) { ell(c, 0, 4, 15, 10, '#7fd6a6'); circ(c, 15, -2, 6, '#7fd6a6'); dot(c, 17, -3, 1.4, INK); c.beginPath(); c.moveTo(-6, -4); c.lineTo(6, -4); c.stroke(); }
    else if (k === 5) { const p = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; p.push(Math.cos(a) * 17, Math.sin(a) * 17); } poly(c, p, '#ff6b6b'); c.fillStyle = '#fff'; c.fillRect(-9, -2.5, 18, 5); }
    else if (k === 6) arrow(Math.PI / 2);
    else if (k === 7) { rrect(c, -14, -15, 28, 30, 7, '#7b9cff'); c.fillStyle = '#fff'; c.font = '800 22px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', 0, 2); }
    c.restore();
  }

  // ---------- bản đồ nhỏ ----------
  function drawMini(t) {
    if (role === 'driver') return;
    const c = mctx, sc = mini._sc, w = mini._w, h = mini._h;
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, w, h);
    const ox = (w - map.W * sc) / 2, oy = (h - map.H * sc) / 2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); map.pts.forEach(([x, y], i) => i ? c.lineTo(ox + x * sc, oy + y * sc) : c.moveTo(ox + x * sc, oy + y * sc));
    c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = THEME[map.theme].road; c.lineWidth = 3.5; c.stroke();
    map.stops.forEach((s, i) => { if (!snap || snap.stops[i] < 2) { c.lineWidth = 1.5; c.strokeStyle = INK; circ(c, ox + s.x * sc, oy + s.y * sc, 3.5, '#7cc7ff'); } });
    const f = map.pts[map.pts.length - 1];
    c.lineWidth = 1.5; c.strokeStyle = INK; circ(c, ox + f[0] * sc, oy + f[1] * sc, 4, '#ff8fb1');
    const pulse = 3.5 + Math.sin(t * 6);
    circ(c, ox + disp.x * sc, oy + disp.y * sc, pulse, '#ffd36e');
  }

  // ---------- màn hình tài xế ----------
  function drawDriver(dt, t) {
    const c = ctx, th = THEME[map.theme], s = snap;
    const v = s ? s.car[3] : 0, spd = Math.abs(v);
    let sx = 0, sy = 0;
    if (s && s.off && spd > 10) { sx = (Math.random() - .5) * 5; sy = (Math.random() - .5) * 5; }
    if (shake) { sx += (Math.random() - .5) * 16 * shake; sy += (Math.random() - .5) * 16 * shake; }
    c.save(); c.translate(sx, sy);
    // nội thất
    c.fillStyle = '#3a3355'; c.fillRect(-20, -20, vw + 40, vh + 40);
    const narrow = vw < vh;
    const wx = 14, wy = (narrow ? 70 : 64), ww = vw - 28, wh = Math.round(vh * (narrow ? .48 : .52));
    // kính lái
    c.save();
    c.beginPath(); c.roundRect(wx, wy, ww, wh, [40, 40, 18, 18]); c.clip();
    const g = c.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, th.fog[0]); g.addColorStop(1, th.fog[1]);
    c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
    // sương bay ra từ điểm tụ: tốc độ càng nhanh bay càng nhanh
    const cx = wx + ww / 2, cy = wy + wh * .42;
    while (puffs.length < 46) puffs.push({ a: Math.random() * TAU, r: Math.random() * .2, s: .6 + Math.random() * .8 });
    for (const p of puffs) {
      p.r += dt * (.05 + spd / 260) * p.s * (1 + p.r * 2.4);
      if (p.r > 1.4) { p.r = Math.random() * .1; p.a = Math.random() * TAU; }
      const R = p.r * Math.max(ww, wh) * .6, x = cx + Math.cos(p.a) * R * 1.3, y = cy + Math.sin(p.a) * R * .8;
      const size = 6 + p.r * 70 * p.s;
      c.globalAlpha = Math.min(1, p.r * 3) * .55;
      if (map.theme === 'snow') { dot(c, x, y, 2 + p.r * 7, '#fff'); }
      else if (map.theme === 'night') { c.globalAlpha *= .8; dot(c, x, y, 2 + p.r * 10, p.s > 1 ? '#ffd36e' : '#8f95c9'); }
      else dot(c, x, y, size, '#fff');
    }
    c.globalAlpha = 1;
    // giọt nước trên kính
    c.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 18; i++) { const x = wx + ((i * 97) % ww), y = wy + ((i * 53 + t * 18 * (i % 3 + 1)) % wh); c.beginPath(); c.ellipse(x, y, 3, 5, 0, 0, TAU); c.fill(); }
    // tín hiệu lớn giữa kính
    const cur = sigs[0];
    if (cur && cur.t < 2.6) {
      const pop = Math.min(1, cur.t * 7), sc = (narrow ? 1.3 : 1.7) * (.6 + pop * .4 + Math.max(0, .15 - Math.abs(cur.t - .15)) * 2);
      const al = 1 - Math.max(0, cur.t - 2) / .6;
      c.save(); c.globalAlpha = al; c.translate(cx, cy - 6);
      drawSigIcon(c, cur.k, 0, 0, sc, 0);
      c.restore();
      label(c, cx, cy + 58 * sc / 1.5, BIG[cur.k], INK, al, narrow ? 26 : 34, '#fff');
    } else if (s && s.ph === 'drive') {
      label(c, cx, cy, 'Không thấy gì cả…', th.dark ? '#5b5f8f' : 'rgba(74,59,82,.55)', 1, narrow ? 18 : 22);
    }
    // lịch sử tín hiệu
    sigs.slice(1, 5).forEach((sg, i) => { c.save(); c.globalAlpha = .75 - i * .15; drawSigIcon(c, sg.k, wx + 34 + i * 50, wy + wh - 32, .65, 0); c.restore(); });
    // đang đón khách
    if (s && map.stops.some((_, i) => s.stops[i] > 0 && s.stops[i] < 2)) {
      const p = Math.max(...s.stops.filter(x => x < 2));
      label(c, cx, wy + 34, 'Khách đang lên xe… đứng yên!', '#2f8a5f', 1, 18, '#e5fbef');
      c.lineWidth = 6; c.strokeStyle = '#4fb383'; c.beginPath(); c.moveTo(cx - 90, wy + 56); c.lineTo(cx - 90 + 180 * p, wy + 56); c.stroke();
    }
    c.restore();
    c.lineWidth = 5; c.strokeStyle = INK; c.beginPath(); c.roundRect(wx, wy, ww, wh, [40, 40, 18, 18]); c.stroke();
    // gương chiếu hậu: các bé khách đã lên xe
    const mw = Math.min(200, ww * .4), mx = cx - mw / 2, my = wy - 6;
    c.lineWidth = 3; rrect(c, mx, my, mw, 40, 14, '#d8eefc');
    c.save(); c.beginPath(); c.roundRect(mx + 3, my + 3, mw - 6, 34, 11); c.clip();
    const riders = map.stops.filter((_, i) => s && s.stops[i] >= 2);
    if (!riders.length) { c.fillStyle = '#8aa6bd'; c.font = '700 12px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Chưa có khách', cx, my + 21); }
    riders.forEach((r, i) => drawAnimal(c, r.kind, cx + (i - (riders.length - 1) / 2) * 40, my + 50, { scale: .9, phase: t * 3 + i }));
    c.restore();

    // bảng đồng hồ
    const dy = wy + wh + 10, dh = vh - dy;
    c.fillStyle = '#ff8fb1'; c.beginPath(); c.roundRect(-10, dy, vw + 20, dh + 20, [36, 36, 0, 0]); c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
    const gs = Math.min(narrow ? 44 : 56, dh * .3);
    const gy = dy + gs + 12;
    // đồng hồ tốc độ
    const gx1 = narrow ? vw * .2 : vw / 2 - gs * 3.4;
    c.lineWidth = 3; circ(c, gx1, gy, gs, '#fffaf2');
    c.lineWidth = 2; for (let i = 0; i <= 8; i++) { const a = Math.PI * .75 + i / 8 * Math.PI * 1.5; c.beginPath(); c.moveTo(gx1 + Math.cos(a) * gs * .78, gy + Math.sin(a) * gs * .78); c.lineTo(gx1 + Math.cos(a) * gs * .9, gy + Math.sin(a) * gs * .9); c.stroke(); }
    const na = Math.PI * .75 + Math.min(1, spd / 290) * Math.PI * 1.5;
    c.lineWidth = 4; c.strokeStyle = '#e46a92'; c.beginPath(); c.moveTo(gx1, gy); c.lineTo(gx1 + Math.cos(na) * gs * .72, gy + Math.sin(na) * gs * .72); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2; circ(c, gx1, gy, 5, INK);
    c.fillStyle = INK; c.font = `800 ${Math.round(gs * .3)}px "Baloo 2",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(v < -2 ? 'LÙI' : Math.round(spd / 4) + '', gx1, gy + gs * .45);
    // đèn va chạm
    const gx2 = narrow ? vw * .8 : vw / 2 + gs * 3.4, dg = s ? s.dg : 0;
    c.lineWidth = 3; c.strokeStyle = INK; circ(c, gx2, gy, gs, '#fffaf2');
    const blink = dg > .05 ? (Math.sin(t * (6 + dg * 20)) > 0 ? 1 : .55) : 0;
    const lampCol = dg > .66 ? '#ff5d7d' : dg > .33 ? '#ff9f43' : dg > .05 ? '#ffd36e' : '#d9d2df';
    c.save(); if (blink) { c.shadowColor = lampCol; c.shadowBlur = 24 * blink; } circ(c, gx2, gy - gs * .1, gs * .52, lampCol); c.restore();
    c.fillStyle = INK; c.font = `800 ${Math.round(gs * .24)}px "Baloo 2",sans-serif`; c.fillText('va chạm', gx2, gy + gs * .62);
    // tiếng tít tít kiểu cảm biến lùi
    beepT -= dt;
    if (dg > .08 && s && s.ph === 'drive' && beepT <= 0) { A.beep(dg > .66 ? 1500 : 1100, .06, 'square', .05); beepT = .55 - dg * .45; }
    // trên cỏ
    if (s && (s.off || s.sl)) label(c, vw / 2, dy + 20, s.off ? 'Xe đang rung… ra khỏi đường rồi!' : 'Đường trơn!', s.off ? '#c0504d' : '#2f6fa8', .9 + Math.sin(t * 8) * .1, narrow ? 14 : 16, '#fff');
    // vô lăng
    const st = s ? s.st : 0;
    const padUp = A.isTouch || vw <= 760; // có nút lái ở dưới: đưa vô lăng lên giữa
    let swR, swCy;
    if (padUp) { const top = gy + gs + 8, bot = vh - 108; swR = Math.max(26, Math.min(vw * .17, (bot - top) * .42)); swCy = (top + bot) / 2; }
    else { swR = Math.min(90, dh * .38); swCy = vh - Math.max(10, swR * .4) + 6 - swR * .35; }
    c.save(); c.translate(vw / 2, swCy); c.rotate(st * .8);
    c.lineWidth = 16; c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, swR, 0, TAU); c.stroke();
    c.lineWidth = 10; c.strokeStyle = '#fffaf2'; c.beginPath(); c.arc(0, 0, swR, 0, TAU); c.stroke();
    c.lineWidth = 9; c.strokeStyle = '#fffaf2'; c.beginPath(); c.moveTo(-swR, 0); c.lineTo(swR, 0); c.moveTo(0, 0); c.lineTo(0, swR); c.stroke();
    c.lineWidth = 3; c.strokeStyle = INK; circ(c, 0, 0, swR * .26, '#ffd36e');
    c.restore();
    c.restore();
    if (flash) { c.fillStyle = `rgba(255,93,125,${flash * .45})`; c.fillRect(0, 0, vw, vh); }
  }

  registerGame('drive', { thumb, mount, onMsg, unmount });
})();
