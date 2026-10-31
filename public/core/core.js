// Popo — client lõi: trang chủ, phòng chờ, kết nối (tự vào lại khi rớt mạng), biểu cảm.
//
// Mỗi game đăng ký bằng registerGame(id, module), module gồm:
//   thumb(ctx, w, h, t)   — (tuỳ chọn) vẽ ảnh bìa trên thẻ game
//   mount(root, api)      — dựng giao diện game trong #gameRoot
//   onMsg(d)              — tin nhắn từ server ({t:'g', d})
//   unmount()             — dọn dẹp khi trận kết thúc
// api: send(d), myId, lobby, player(id), sfx, beep, vibrate, esc, isTouch
const $ = id => document.getElementById(id);
const GAMES = {};
function registerGame(id, mod) { GAMES[id] = mod; }

const COMING = [
  { id: 'couple', name: 'Hiểu Nhau Bao Nhiêu', desc: 'Trả lời câu hỏi về nhau, xem ai hiểu ai hơn', tag: 'Cặp đôi', icon: '<svg viewBox="0 0 48 48"><path d="M8 10h26a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H20l-7 6v-6H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="#fff" stroke="#4a3b52" stroke-width="3" stroke-linejoin="round"/><path d="M21 25s-6-3.5-6-7a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 3.5-6 7-6 7z" fill="#ff6b8b" stroke="#4a3b52" stroke-width="2.4" stroke-linejoin="round"/></svg>', bg: '#ffd9e5' },
  { id: 'wordchain', name: 'Nối Từ', desc: 'Nối từ tiếng Việt, ai bí trước là thua', tag: 'Chữ', icon: '<svg viewBox="0 0 48 48"><rect x="4" y="14" width="18" height="20" rx="5" fill="#fff" stroke="#4a3b52" stroke-width="3"/><rect x="26" y="14" width="18" height="20" rx="5" fill="#ffd36e" stroke="#4a3b52" stroke-width="3"/><text x="13" y="29" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="13" fill="#4a3b52">Ă</text><text x="35" y="29" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="13" fill="#4a3b52">N</text></svg>', bg: '#fff1c9' },
  { id: 'caro', name: 'Cờ Caro', desc: 'Năm quân liên tiếp là thắng', tag: '2 người', icon: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="8" fill="#fff" stroke="#4a3b52" stroke-width="3"/><path d="M18 6v36M30 6v36M6 18h36M6 30h36" stroke="#efe1cf" stroke-width="2.5"/><path d="M9 9l6 6M15 9l-6 6" stroke="#ff6b8b" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="3.5" fill="none" stroke="#7b9cff" stroke-width="3"/><path d="M33 33l6 6M39 33l-6 6" stroke="#ff6b8b" stroke-width="3" stroke-linecap="round"/></svg>', bg: '#e3ecff' },
  { id: 'draw', name: 'Vẽ & Đoán', desc: 'Một người vẽ, cả nhóm đoán chữ', tag: 'Nhóm', icon: '<svg viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="30" rx="6" fill="#fff" stroke="#4a3b52" stroke-width="3"/><path d="M12 30q6-14 12-4t12-8" fill="none" stroke="#8f7bff" stroke-width="3" stroke-linecap="round"/><path d="M30 34l10-14 4 3-10 14-5 1z" fill="#ffd36e" stroke="#4a3b52" stroke-width="2.4" stroke-linejoin="round"/></svg>', bg: '#ece6ff' },
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mkStore = area => ({
  get: (k, d) => { try { const v = window[area].getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { v == null ? window[area].removeItem(k) : window[area].setItem(k, JSON.stringify(v)); } catch {} },
});
const store = mkStore('localStorage');
const tabStore = mkStore('sessionStorage'); // phiên phòng theo từng tab: mở 2 tab = 2 người chơi
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ================== ÂM THANH + RUNG ==================
let ac;
function beep(f, dur = .1, type = 'sine', vol = .15, slide = 0) {
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch {}
}
addEventListener('pointerdown', () => { try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); } catch {} }, { passive: true });
const sfx = {
  click: () => beep(600, .05, 'triangle', .06, 200),
  pop: () => beep(880, .08, 'triangle', .07, 300),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .12, 'triangle', .12), i * 80)),
  lose: () => { beep(300, .15, 'square', .06); setTimeout(() => beep(200, .2, 'square', .06), 120); },
};
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ================== TRẠNG THÁI ==================
let ws = null, myId = 0, lobby = null, catalog = [], current = null, currentId = null;
let sess = tabStore.get('sess', null);        // {code, token} để vào lại phòng
let myAv = store.get('av', Math.random() * 6 | 0);
const api = {
  send: d => sendMsg({ t: 'g', d }),
  get myId() { return myId; },
  get lobby() { return lobby; },
  player: id => lobby && lobby.players.find(p => p.id === id),
  sfx, beep, vibrate, esc, isTouch,
};

function show(id) {
  for (const s of ['home', 'lobby']) $(s).classList.toggle('on', s === id);
  const inGame = id === 'game';
  document.body.classList.toggle('in-game', inGame);
  bgc.style.display = inGame ? 'none' : 'block';
  $('emoteBtn').classList.toggle('hidden', id === 'home');
  if (id === 'home') $('emotePanel').classList.remove('on');
}

// ================== MẠNG ==================
// Máy chủ game: mặc định cùng địa chỉ với trang web. Nếu trang web tĩnh nằm chỗ khác
// (vd. Vercel) thì đặt window.POPO_SERVER trong public/config.js trỏ tới máy chủ Node.
const SERVER_URL = (() => {
  const s = String(window.POPO_SERVER || '').trim().replace(/\/+$/, '');
  if (s) return s.replace(/^http/, 'ws');
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
})();
let reconnTimer = null, reconnUntil = 0, homeRetry = null;
function connect(onOpen) {
  if (ws && ws.readyState === 1) return onOpen();
  if (ws && ws.readyState === 0) { ws.addEventListener('open', onOpen, { once: true }); return; }
  const sock = ws = new WebSocket(SERVER_URL);
  sock.onopen = () => { sock.opened = true; clearTimeout(homeRetry); onOpen(); };
  sock.onmessage = e => onMsg(JSON.parse(e.data));
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (sess) return startReconnect();
    if (!$('home').classList.contains('on')) { unmountGame(); show('home'); $('err').textContent = 'Mất kết nối với máy chủ game!'; }
    else if (!sock.opened) $('err').textContent = 'Chưa kết nối được máy chủ game, đang thử lại…';
    // ở trang chủ: tự thử lại để lấy danh sách game (máy chủ miễn phí có thể mất ~30s để thức dậy)
    clearTimeout(homeRetry);
    homeRetry = setTimeout(() => { if (!ws && !sess) connect(() => {}); }, 3000);
  };
}
const sendMsg = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

function startReconnect(first) {
  if (reconnTimer) return;
  reconnUntil = Date.now() + 35000;
  $('reconnect').classList.add('on');
  $('reconnTxt').textContent = first ? 'Đang vào lại phòng…' : '';
  const tryOnce = () => {
    if (!sess) return stopReconnect();
    if (Date.now() > reconnUntil) { stopReconnect(); sess = null; tabStore.set('sess', null); unmountGame(); show('home'); $('err').textContent = 'Không kết nối lại được, bạn tạo phòng mới nhé!'; return; }
    $('reconnTxt').textContent = `Còn ${Math.ceil((reconnUntil - Date.now()) / 1000)} giây giữ chỗ`;
    if (!ws) connect(() => sendMsg({ t: 'rejoin', code: sess.code, token: sess.token }));
  };
  tryOnce();
  reconnTimer = setInterval(tryOnce, 1500);
}
function stopReconnect() { clearInterval(reconnTimer); reconnTimer = null; $('reconnect').classList.remove('on'); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && sess && (!ws || ws.readyState > 1)) startReconnect(); });

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      catalog = m.games; renderCatalog();
      if (/máy chủ game/.test($('err').textContent)) $('err').textContent = '';
      break;
    case 'joined':
      myId = m.id; sess = { code: m.code, token: m.token }; tabStore.set('sess', sess);
      stopReconnect();
      break;
    case 'rejoin_fail':
      stopReconnect(); sess = null; tabStore.set('sess', null); unmountGame(); show('home');
      $('err').textContent = 'Phòng đã đóng hoặc hết thời gian giữ chỗ.';
      break;
    case 'err': $('err').textContent = $('lerr').textContent = m.msg; $('lerr').classList.remove('ok'); break;
    case 'lobby': onLobby(m); break;
    case 'emote': onEmote(m); break;
    case 'g': if (current) current.onMsg(m.d); break;
  }
}

function onLobby(m) {
  lobby = m;
  if (m.state === 'playing') {
    if (!current || currentId !== m.game) { unmountGame(); mountGame(m.game); }
    return;
  }
  unmountGame();
  renderLobby();
  show('lobby');
}
function mountGame(id) {
  const mod = GAMES[id];
  if (!mod) return;
  current = mod; currentId = id;
  show('game');
  mod.mount($('gameRoot'), api);
}
function unmountGame() {
  if (!current) return;
  try { current.unmount(); } catch (e) { console.error(e); }
  current = null; currentId = null;
  $('gameRoot').innerHTML = '';
}

// ================== TRANG CHỦ ==================
$('logoAv').append(avatar(0, 72));
$('name').value = store.get('name', '');
function renderAvPick() {
  const box = $('avPick'); box.innerHTML = '';
  for (let k = 0; k < 6; k++) {
    const b = document.createElement('button');
    b.className = k === myAv ? 'on' : ''; b.title = ANIMAL_NAMES[k];
    b.append(avatar(k, 52));
    b.onclick = () => { myAv = k; store.set('av', k); sfx.pop(); renderAvPick(); };
    box.append(b);
  }
}
renderAvPick();
const myName = () => { const n = $('name').value.trim() || 'Bạn nhỏ'; store.set('name', n); return n; };
function createRoom(game) { sfx.click(); $('err').textContent = ''; connect(() => sendMsg({ t: 'join', name: myName(), av: myAv, game })); }
$('btnCreate').onclick = () => createRoom();
$('btnJoin').onclick = () => {
  sfx.click();
  const c = $('code').value.trim();
  if (c.length !== 4) return $('err').textContent = 'Mã phòng có 4 chữ nha!';
  connect(() => sendMsg({ t: 'join', name: myName(), av: myAv, code: c }));
};
// lưu ý: không dùng `onkeydown = e => cond && ...` — trả về false sẽ chặn luôn phím (Backspace…)
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') ($('code').value.trim() ? $('btnJoin') : $('btnCreate')).click(); });
const qs = new URLSearchParams(location.search).get('room');
if (qs) { $('code').value = qs.toUpperCase(); history.replaceState(null, '', location.pathname); }

const thumbs = []; // canvas thẻ game có hoạt ảnh
function gameThumb(id, w, h) {
  const mod = GAMES[id];
  if (!mod || !mod.thumb) return null;
  const c = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1);
  c.width = w * d; c.height = h * d;
  const x = c.getContext('2d'); x.scale(d, d);
  thumbs.push({ c, x, w, h, mod });
  return c;
}
function renderCatalog() {
  thumbs.length = 0;
  const box = $('homeGames'); box.innerHTML = '';
  if (!catalog.length) box.innerHTML = '<div class="gcard soon"><div class="thumb"><div class="spinner"></div></div><div class="meta"><b>Đang kết nối máy chủ…</b><small>Danh sách game sẽ hiện khi kết nối xong</small></div></div>';
  for (const g of catalog) {
    const b = document.createElement('button'); b.className = 'gcard';
    const th = document.createElement('div'); th.className = 'thumb';
    const cvs = gameThumb(g.id, 240, 96); if (cvs) th.append(cvs);
    th.insertAdjacentHTML('beforeend', `<span class="tag">${esc(g.tag || '')}</span>`);
    b.append(th);
    b.insertAdjacentHTML('beforeend', `<div class="meta"><b>${esc(g.name)}</b><small>${esc(g.desc)} · ${g.min === g.max ? g.min : g.min + '–' + g.max} người</small></div>`);
    b.onclick = () => createRoom(g.id);
    box.append(b);
  }
  for (const g of COMING) {
    const b = document.createElement('div'); b.className = 'gcard soon';
    b.innerHTML = `<div class="thumb" style="background:${g.bg}">${g.icon}<span class="tag">Sắp ra mắt</span></div><div class="meta"><b>${esc(g.name)}</b><small>${esc(g.desc)}</small></div>`;
    box.append(b);
  }
}

// ================== PHÒNG CHỜ ==================
function renderLobby() {
  const m = lobby, isHost = m.host === myId;
  $('lcode').textContent = m.code;
  const box = $('lplayers'); box.innerHTML = '';
  for (const p of m.players) {
    const d = document.createElement('div');
    d.className = 'pl' + (p.id === myId ? ' me' : '') + (p.on ? '' : ' off');
    d.append(avatar(p.av, 38));
    d.insertAdjacentHTML('beforeend', `<span class="nm">${esc(p.name)}<small>${p.on ? (p.wins ? p.wins + ' trận thắng' : 'Sẵn sàng') : 'Mất kết nối…'}</small></span>${p.id === m.host ? `<span class="crown" title="Chủ phòng"><svg class="i f"><use href="#i-crown"/></svg></span>` : ''}`);
    box.append(d);
  }
  const pick = $('gamePick'); pick.innerHTML = '';
  for (const g of catalog) {
    const b = document.createElement('button'); b.className = 'gp' + (g.id === m.game ? ' on' : '');
    const ico = document.createElement('span'); ico.className = 'ico';
    const t = gameThumb(g.id, 34, 34); if (t) ico.append(t);
    b.append(ico); b.insertAdjacentHTML('beforeend', esc(g.name));
    b.disabled = !isHost;
    b.onclick = () => { sfx.click(); sendMsg({ t: 'settings', game: g.id }); };
    pick.append(b);
  }
  for (const g of COMING) pick.insertAdjacentHTML('beforeend', `<span class="gp soon"><span class="ico" style="background:${g.bg}">${g.icon}</span>${esc(g.name)}</span>`);
  const meta = catalog.find(g => g.id === m.game);
  const st = $('settings'); st.innerHTML = '';
  for (const o of (meta && meta.settings) || []) {
    const wrap = document.createElement('div'); wrap.className = 'setting';
    wrap.innerHTML = `<span>${esc(o.label)}</span>`;
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const opt of o.options) {
      const b = document.createElement('button');
      b.textContent = opt.label; b.className = m.settings[o.key] === opt.v ? 'on' : ''; b.disabled = !isHost;
      b.onclick = () => { sfx.click(); sendMsg({ t: 'settings', settings: { [o.key]: opt.v } }); };
      seg.append(b);
    }
    wrap.append(seg); st.append(wrap);
  }
  const online = m.players.filter(p => p.on).length, need = meta ? meta.min : 2;
  $('btnStart').style.display = isHost ? '' : 'none';
  $('lwait').style.display = isHost && online >= need ? 'none' : '';
  $('lwait').textContent = online < need ? `Cần ít nhất ${need} người — gửi mã phòng cho bạn bè nhé!` : 'Đang đợi chủ phòng bắt đầu…';
}
$('btnStart').onclick = () => { sfx.click(); $('lerr').textContent = ''; sendMsg({ t: 'start' }); };
$('btnLeave').onclick = () => { sfx.click(); sendMsg({ t: 'leave' }); sess = null; tabStore.set('sess', null); lobby = null; show('home'); };
$('btnCopy').onclick = async () => {
  const link = `${location.origin}/?room=${lobby.code}`;
  try {
    if (navigator.share && isTouch) await navigator.share({ title: 'Popo', text: `Vào chơi với mình! Mã phòng ${lobby.code}`, url: link });
    else { await navigator.clipboard.writeText(link); $('lerr').textContent = 'Đã copy link mời!'; $('lerr').classList.add('ok'); }
  } catch {}
};

// ================== BIỂU CẢM ==================
const panel = $('emotePanel');
for (let i = 0; i < 8; i++) {
  const b = document.createElement('button');
  b.innerHTML = `<svg><use href="#e-${i}"/></svg>`;
  b.onclick = () => { sendMsg({ t: 'emote', e: i }); panel.classList.remove('on'); vibrate(10); };
  panel.append(b);
}
$('emoteBtn').onclick = e => { e.stopPropagation(); sfx.pop(); panel.classList.toggle('on'); };
addEventListener('pointerdown', e => { if (!panel.contains(e.target) && e.target !== $('emoteBtn')) panel.classList.remove('on'); });
function onEmote(m) {
  const p = api.player(m.id); if (!p) return;
  const d = document.createElement('div'); d.className = 'react';
  d.append(avatar(p.av, 30));
  d.insertAdjacentHTML('beforeend', `<span>${esc(p.name)}</span><svg><use href="#e-${m.e}"/></svg>`);
  const box = $('reactions'); box.prepend(d);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => d.remove(), 2600);
  beep(700 + m.e * 60, .08, 'triangle', .06, 200);
}

// ================== NỀN TRANG CHỦ: thú đi dạo ==================
const bgc = $('bgCanvas'), bctx = bgc.getContext('2d');
const homeDecor = document.createElement('canvas');
let vw = 0, vh = 0, homeAnimals = [], homeTrees = [];
function mulberry(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function homeTree(c, x, y, v) {
  c.save(); c.translate(x, y); c.lineWidth = 2.6; c.lineJoin = 'round'; c.strokeStyle = INK;
  c.beginPath(); c.ellipse(6, 42, 58, 17, 0, 0, TAU); c.fillStyle = 'rgba(60,90,50,.2)'; c.fill();
  rrect(c, -9, 0, 18, 44, 6, '#c08a5b');
  cloud(c, [[-30, -6, 32], [28, -4, 34], [0, -32, 38], [0, 6, 36]], ['#6cc77e', '#7fcf7a', '#5fbf8f'][v % 3]);
  dot(c, -14, -42, 12, 'rgba(255,255,255,.3)');
  if (v % 3 === 0) for (const [fx, fy] of [[-22, -18], [18, -34], [24, 8], [-6, 4]]) circ(c, fx, fy, 4.5, '#ff7b8b');
  c.restore();
}
function buildHomeDecor() {
  const r = mulberry(42), d = Math.min(2, devicePixelRatio || 1);
  homeDecor.width = vw * d; homeDecor.height = vh * d;
  const g = homeDecor.getContext('2d'); g.scale(d, d);
  g.fillStyle = '#9ddf8f'; g.fillRect(0, 0, vw, vh);
  for (let i = 0; i < vw * vh / 9000; i++) {
    g.fillStyle = r() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(60,140,70,.06)';
    g.beginPath(); g.ellipse(r() * vw, r() * vh, 40 + r() * 110, 30 + r() * 70, r() * 3, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(60,140,70,.5)'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let i = 0; i < vw * vh / 2500; i++) { const x = r() * vw, y = r() * vh; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 6, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9); g.moveTo(x + 4, y); g.lineTo(x + 6, y - 7); g.stroke(); }
  const cols = ['#ffffff', '#ffd36e', '#ff9fc4', '#c7a8ff'];
  for (let i = 0; i < vw * vh / 7000; i++) {
    const x = r() * vw, y = r() * vh; g.fillStyle = cols[i % 4];
    for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(x + Math.cos(a * 1.26) * 3.4, y + Math.sin(a * 1.26) * 3.4, 2.8, 0, TAU); g.fill(); }
    g.fillStyle = '#ffb347'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  }
  homeTrees = [];
  for (let i = 0; i < Math.max(4, vw / 260); i++) homeTrees.push([r() * vw, r() < .5 ? 60 + r() * 120 : vh - 40 - r() * 100, i]);
  if (!homeAnimals.length || homeAnimals.some(a => a.x > vw || a.y > vh))
    homeAnimals = Array.from({ length: Math.max(8, Math.round(vw * vh / 80000)) }, (_, i) => ({ k: i % 6, x: r() * vw, y: r() * vh, tx: r() * vw, ty: r() * vh, wait: r() * 3, flip: 0 }));
}
function resizeBg() {
  const d = Math.min(2, devicePixelRatio || 1);
  vw = innerWidth; vh = innerHeight;
  bgc.width = vw * d; bgc.height = vh * d;
  bctx.setTransform(d, 0, 0, d, 0, 0);
  buildHomeDecor();
}
addEventListener('resize', resizeBg);
resizeBg();
let lastT = performance.now();
function homeFrame(t) {
  requestAnimationFrame(homeFrame);
  const dt = Math.min(.05, (t - lastT) / 1000), sec = t / 1000; lastT = t;
  for (const th of thumbs) if (th.c.isConnected) { th.x.clearRect(0, 0, th.w, th.h); th.mod.thumb(th.x, th.w, th.h, sec); }
  if (current || !homeDecor.width || !homeDecor.height) return;
  bctx.drawImage(homeDecor, 0, 0, vw, vh);
  for (const a of homeAnimals) {
    if (a.wait > 0) { a.wait -= dt; a.mv = false; continue; }
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d < 3) { a.wait = 1 + Math.random() * 3; a.tx = Math.max(30, Math.min(vw - 30, a.x + (Math.random() - .5) * 300)); a.ty = Math.max(40, Math.min(vh - 20, a.y + (Math.random() - .5) * 300)); }
    else { a.x += dx / d * 40 * dt; a.y += dy / d * 40 * dt; a.flip = dx > 0 ? 1 : 0; a.mv = true; }
  }
  const items = [...homeAnimals.map(a => ({ y: a.y, a })), ...homeTrees.map(tr => ({ y: tr[1] + 30, tr }))].sort((p, q) => p.y - q.y);
  for (const it of items) {
    if (it.a) drawAnimal(bctx, it.a.k, it.a.x, it.a.y, { flip: it.a.flip, moving: it.a.mv, phase: sec * 11 + it.a.k * 7, scale: 1.4 });
    else homeTree(bctx, it.tr[0], it.tr[1], it.tr[2]);
  }
  bctx.fillStyle = 'rgba(255,250,242,.12)'; bctx.fillRect(0, 0, vw, vh);
}
requestAnimationFrame(homeFrame);

// kết nối sẵn để lấy danh sách game; nếu đang có phiên cũ thì vào lại phòng
renderCatalog();
addEventListener('load', () => {
  if (sess) startReconnect(true);
  else connect(() => {});
});
