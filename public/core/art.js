// Đồ họa dùng chung cho cả nền tảng — phong cách "sticker": viền đậm, màu pastel.
// Mọi con vật đứng tại (0,0) = chân, mặc định quay sang TRÁI; flip = quay phải.
const INK = '#4a3b52';
const TAU = Math.PI * 2;
// 0–5 nông trại · 6–10 làng tuyết · 11–15 bãi biển (server chọn bộ thú theo bản đồ)
const ANIMAL_NAMES = ['heo', 'bò', 'cừu', 'gà', 'vịt', 'thỏ',
  'chim cánh cụt', 'gấu trắng', 'hải cẩu', 'cáo tuyết', 'tuần lộc',
  'cua', 'rùa biển', 'hải âu', 'hồng hạc', 'rái cá'];
const ANIMAL_SOUNDS = ['Ụt ịt!', 'Ùmm bò~', 'Be be!', 'Ò ó o!', 'Cạp cạp!', 'Chít chít!',
  'Quác quác!', 'Grừ grừ~', 'Ọ ọ ọ!', 'Ẳng ẳng!', 'Leng keng!',
  'Lách cách!', 'Hừmmm~', 'Ké ké ké!', 'Hônk hônk!', 'Chíp chíp!'];
const ANIMAL_H = [30, 40, 32, 32, 28, 36, 36, 34, 24, 30, 48, 22, 22, 30, 52, 28]; // chiều cao xấp xỉ, để đặt nhãn/hiệu ứng
const SHADOW_R = [17, 22, 17, 11, 12, 12, 11, 19, 20, 15, 20, 17, 18, 11, 10, 16];
const AVATAR_BG = ['#ffe3ec', '#eef0ff', '#f1f6e9', '#fff2dc', '#fff8d6', '#f6ecff'];

function ell(c, x, y, rx, ry, fill, rot = 0, stroke = true) {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
const circ = (c, x, y, r, fill, stroke = true) => ell(c, x, y, r, r, fill, 0, stroke);
const dot = (c, x, y, r, fill) => circ(c, x, y, r, fill, false);
function rrect(c, x, y, w, h, r, fill, stroke = true) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
function poly(c, pts, fill, stroke = true) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) c.stroke();
}
let eyesClosed = false;
function eye(c, x, y, r = 2.6) {
  if (eyesClosed) { c.beginPath(); c.arc(x, y - r * .3, r * .9, .15 * Math.PI, .85 * Math.PI); c.stroke(); return; }
  dot(c, x, y, r, INK); dot(c, x - r * .35, y - r * .4, r * .42, '#fff');
}
const blush = (c, x, y, r = 2.6) => dot(c, x, y, r, 'rgba(255,110,150,.42)');
// vẽ "đám mây" nhiều hình tròn mà không lộ đường viền bên trong
function cloud(c, list, fill) {
  for (const [x, y, r] of list) circ(c, x, y, r, fill);
  for (const [x, y, r] of list) dot(c, x, y, r - c.lineWidth * .7, fill);
}
function shadow(c, x, y, rx, ry = rx * .32) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = 'rgba(40,60,40,.18)'; c.fill(); }

// ---------------- CON VẬT ----------------
function drawAnimal(c, kind, x, y, o = {}) {
  const ph = o.phase || 0, mv = !!o.moving, s = o.scale || 1;
  const lift1 = mv ? -Math.max(0, Math.sin(ph)) * 3 : 0;
  const lift2 = mv ? -Math.max(0, -Math.sin(ph)) * 3 : 0;
  const b = mv ? -Math.abs(Math.sin(ph)) * 1.6 : Math.sin(ph * .25) * (o.sleep ? 1.2 : .5);
  c.save(); c.translate(x, y); c.scale(o.flip ? -s : s, s);
  shadow(c, 0, 0, SHADOW_R[kind]);
  c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
  eyesClosed = !!o.sleep;
  ANIMALS[kind](c, b, lift1, lift2);
  eyesClosed = false;
  c.restore();
  if (o.stun) stars(c, x, y - ANIMAL_H[kind] * s - 6, o.time || 0);
  if (o.sleep) zzz(c, x + 8 * s, y - ANIMAL_H[kind] * s, o.time || 0);
}

const ANIMALS = [
  // 0 HEO
  (c, b, l1, l2) => {
    const P = '#ffb8cb', P2 = '#f59ab3';
    rrect(c, 6, -9 + l2, 6, 9, 3, P2); rrect(c, -14, -9 + l1, 6, 9, 3, P2);
    c.beginPath(); c.arc(18, -17 + b, 3.4, Math.PI * .9, Math.PI * 2.7); c.stroke();
    ell(c, 0, -15 + b, 18, 12, P);
    rrect(c, 9, -9 + l1, 6, 9, 3, P); rrect(c, -10, -9 + l2, 6, 9, 3, P);
    poly(c, [-20, -24 + b, -22, -34 + b, -13, -28 + b], P2);
    poly(c, [-10, -29 + b, -5, -36 + b, -3, -26 + b], P2);
    circ(c, -13, -19 + b, 10.5, P);
    ell(c, -22, -16 + b, 5.6, 4.6, '#ff94b0');
    dot(c, -23.8, -16 + b, 1.1, INK); dot(c, -20.4, -16 + b, 1.1, INK);
    eye(c, -14, -22 + b); blush(c, -9, -15 + b);
  },
  // 1 BÒ
  (c, b, l1, l2) => {
    const Wc = '#fffdf7', S = '#5b4a5e';
    for (const [lx, l, f] of [[8, l2, '#ece5dc'], [-15, l1, '#ece5dc'], [12, l1, Wc], [-11, l2, Wc]]) {
      rrect(c, lx, -13 + l, 7, 13, 3, f); dot(c, lx + 3.5, -1.5 + l, 3, S);
    }
    c.beginPath(); c.moveTo(21, -26 + b); c.quadraticCurveTo(28, -20 + b, 25, -11 + b); c.stroke();
    ell(c, 25, -10 + b, 2.5, 3.5, S);
    ell(c, 0, -22 + b, 22, 13, Wc);
    c.save(); c.beginPath(); c.ellipse(0, -22 + b, 21, 12, 0, 0, TAU); c.clip();
    dot(c, 6, -28 + b, 7, S); dot(c, -8, -17 + b, 5, S); dot(c, 15, -16 + b, 4.5, S);
    c.restore();
    ell(c, -13, -36 + b, 5, 2.6, Wc, -.4); ell(c, -28, -34 + b, 5, 2.6, Wc, .4);
    poly(c, [-17, -38 + b, -16, -45 + b, -13, -37 + b], '#ffe9b0');
    poly(c, [-24, -38 + b, -26, -45 + b, -21, -38 + b], '#ffe9b0');
    ell(c, -20, -29 + b, 10, 11, Wc);
    dot(c, -16, -34 + b, 3.5, S);
    ell(c, -22, -21 + b, 8.5, 5.8, '#ffc2cf');
    dot(c, -25, -21 + b, 1.2, INK); dot(c, -19, -21 + b, 1.2, INK);
    eye(c, -24, -30 + b, 2.4); eye(c, -17, -30 + b, 2.4);
  },
  // 2 CỪU
  (c, b, l1, l2) => {
    const D = '#6b5a6e', Wl = '#fffaf0';
    for (const [lx, l] of [[6, l2], [-12, l1], [10, l1], [-8, l2]]) rrect(c, lx, -10 + l, 5, 10, 2.5, D);
    cloud(c, [[-9, -17 + b, 8], [-2, -23 + b, 9], [8, -22 + b, 9], [14, -15 + b, 8], [5, -12 + b, 9], [-5, -11 + b, 8]], Wl);
    ell(c, -22, -25 + b, 4.5, 2.4, D, .4);
    ell(c, -16, -21 + b, 7, 8.5, D);
    circ(c, -15, -29 + b, 4.5, Wl);
    if (eyesClosed) { c.save(); c.strokeStyle = '#fff'; eye(c, -19, -22 + b, 2); eye(c, -13, -22 + b, 2); c.restore(); }
    else { dot(c, -19, -22 + b, 2.6, '#fff'); dot(c, -19.5, -22 + b, 1.5, INK); dot(c, -13, -22 + b, 2.6, '#fff'); dot(c, -13.5, -22 + b, 1.5, INK); }
    blush(c, -12, -17 + b, 2);
  },
  // 3 GÀ
  (c, b, l1, l2) => {
    const Wc = '#fffaf3', O = '#ffa94d', R = '#ff6b6b';
    c.save(); c.strokeStyle = O; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(-2, -7); c.lineTo(-3, l1); c.moveTo(4, -7); c.lineTo(5, l2);
    c.moveTo(-6, l1); c.lineTo(0, l1); c.moveTo(2, l2); c.lineTo(8, l2); c.stroke(); c.restore();
    ell(c, 11, -20 + b, 5, 8, Wc, .5);
    ell(c, 0, -14 + b, 11.5, 9.5, Wc);
    ell(c, 3, -14 + b, 6, 4, '#f1e6d8', .2);
    circ(c, -10, -30 + b, 2.6, R); circ(c, -7, -31.5 + b, 2.8, R); circ(c, -4, -30 + b, 2.4, R);
    circ(c, -7, -24 + b, 6.8, Wc);
    poly(c, [-13, -25 + b, -18.5, -23 + b, -13, -21 + b], O);
    ell(c, -12, -18.5 + b, 1.8, 2.6, R);
    eye(c, -8.5, -25 + b, 1.9);
  },
  // 4 VỊT
  (c, b, l1, l2) => {
    const Y = '#ffe27a', O = '#ff9f43';
    ell(c, -2, -1 + l1, 4, 2, O); ell(c, 5, -1 + l2, 4, 2, O);
    poly(c, [10, -14 + b, 17, -18 + b, 13, -8 + b], Y);
    ell(c, 1, -11 + b, 13, 9, Y);
    ell(c, 4, -12 + b, 7, 4.5, '#ffd24d', .15);
    circ(c, -9, -21 + b, 7.6, Y);
    ell(c, -17, -19 + b, 5.2, 2.7, O);
    eye(c, -10, -23 + b, 2); blush(c, -6, -18 + b, 2);
  },
  // 5 THỎ
  (c, b, l1, l2) => {
    const F = '#f4ece4', PK = '#ffc2d4';
    ell(c, 6, -3 + l2, 6, 3, F);
    circ(c, 14, -12 + b, 4.5, '#fff');
    ell(c, 2, -12 + b, 12, 10, F);
    ell(c, -6, -2 + l1, 3.5, 2.5, F); ell(c, 0, -2 + l2, 3.5, 2.5, F);
    ell(c, -14, -33 + b, 3.4, 9.5, F, -.25); ell(c, -14, -33 + b, 1.6, 6.5, PK, -.25, false);
    ell(c, -7, -34 + b, 3.4, 9.5, F, .2); ell(c, -7, -34 + b, 1.6, 6.5, PK, .2, false);
    circ(c, -10, -20 + b, 8.6, F);
    dot(c, -18, -19 + b, 1.7, '#ff8fb1');
    eye(c, -12, -22 + b, 2.2); blush(c, -7, -17 + b, 2.2);
  },

  // ======== LÀNG TUYẾT ========
  // 6 CHIM CÁNH CỤT
  (c, b, l1, l2) => {
    const N = '#4d5878', O = '#ffa94d';
    ell(c, -4, -1 + l1, 5, 2.6, O); ell(c, 5, -1 + l2, 5, 2.6, O);
    ell(c, 0, -17 + b, 12, 16, N);
    ell(c, -3, -15 + b, 8, 12.5, '#fffaf3', 0, false);
    ell(c, 9, -16 + b, 3.5, 9, N, -.3);
    poly(c, [-10, -26 + b, -18, -23 + b, -10, -21 + b], O);
    eye(c, -6, -27 + b, 2.2); blush(c, -4, -21 + b, 2.2);
  },
  // 7 GẤU TRẮNG
  (c, b, l1, l2) => {
    const Wc = '#fbf7ef', D = '#ece4d6';
    rrect(c, 6, -11 + l2, 8, 11, 4, D); rrect(c, -14, -11 + l1, 8, 11, 4, D);
    ell(c, 1, -17 + b, 19, 13, Wc);
    circ(c, 19, -20 + b, 3.5, Wc);
    rrect(c, 9, -11 + l1, 8, 11, 4, Wc); rrect(c, -10, -11 + l2, 8, 11, 4, Wc);
    circ(c, -19, -31 + b, 4.5, Wc); circ(c, -8, -32 + b, 4.5, Wc);
    dot(c, -19, -31 + b, 2, '#ffc2d4'); dot(c, -8, -32 + b, 2, '#ffc2d4');
    circ(c, -14, -22 + b, 11, Wc);
    ell(c, -22, -19 + b, 6, 4.5, '#fff');
    dot(c, -25, -20 + b, 2.2, INK);
    eye(c, -15, -25 + b, 2.3); blush(c, -10, -18 + b, 2.4);
  },
  // 8 HẢI CẨU
  (c, b, l1, l2) => {
    const G = '#a9b6c8', G2 = '#93a2b8';
    poly(c, [18, -4, 28, -9 + l1 * .6, 27, 0], G2);
    c.beginPath(); c.moveTo(-14, -2); c.quadraticCurveTo(-18, -22 + b, -6, -24 + b); c.quadraticCurveTo(14, -18 + b, 22, -2); c.closePath();
    c.fillStyle = G; c.fill(); c.stroke();
    ell(c, -2, -3 + l2 * .5, 6, 3, G2, -.4);
    circ(c, -14, -18 + b, 9, G);
    dot(c, -3, -16 + b, 2.5, '#c6d0dd'); dot(c, 5, -12 + b, 2, '#c6d0dd');
    ell(c, -21, -15 + b, 4, 3, '#d6dee8');
    dot(c, -23.5, -16.5 + b, 1.4, INK);
    c.beginPath(); c.moveTo(-22, -14 + b); c.lineTo(-30, -16 + b); c.moveTo(-22, -13 + b); c.lineTo(-30, -11 + b); c.stroke();
    eye(c, -14, -21 + b, 2.6);
  },
  // 9 CÁO TUYẾT
  (c, b, l1, l2) => {
    const Wc = '#fbf8f3', S = '#e7e0d6';
    cloud(c, [[16, -16 + b, 7], [22, -22 + b, 6]], Wc);
    rrect(c, 5, -9 + l2, 5, 9, 2.5, S); rrect(c, -12, -9 + l1, 5, 9, 2.5, S);
    ell(c, 0, -14 + b, 15, 9, Wc);
    rrect(c, 8, -9 + l1, 5, 9, 2.5, Wc); rrect(c, -9, -9 + l2, 5, 9, 2.5, Wc);
    poly(c, [-20, -24 + b, -21, -36 + b, -13, -28 + b], Wc);
    poly(c, [-11, -28 + b, -6, -37 + b, -4, -25 + b], Wc);
    poly(c, [-19, -27 + b, -19.6, -32 + b, -15, -28.5 + b], '#ffc2d4', false);
    circ(c, -12, -20 + b, 9, Wc);
    ell(c, -20, -17 + b, 6.5, 4, Wc);
    dot(c, -26, -17.5 + b, 2.1, INK);
    eye(c, -14, -22 + b, 2.1); blush(c, -9, -16 + b, 2);
  },
  // 10 TUẦN LỘC
  (c, b, l1, l2) => {
    const Br = '#c08a5b', Br2 = '#a8764b', Cr = '#f3dfc4';
    for (const [lx, l, f] of [[8, l2, Br2], [-14, l1, Br2], [12, l1, Br], [-10, l2, Br]]) { rrect(c, lx, -16 + l, 5, 16, 2.5, f); dot(c, lx + 2.5, -1 + l, 2.6, INK); }
    ell(c, 0, -22 + b, 19, 10, Br);
    circ(c, 18, -26 + b, 4, Cr);
    rrect(c, -18, -34 + b, 9, 14, 4, Br);
    c.save(); c.strokeStyle = '#8a5a44'; c.lineWidth = 3.2;
    c.beginPath(); c.moveTo(-17, -46 + b); c.lineTo(-20, -58 + b); c.moveTo(-19, -53 + b); c.lineTo(-26, -57 + b); c.moveTo(-11, -46 + b); c.lineTo(-8, -58 + b); c.moveTo(-9, -53 + b); c.lineTo(-2, -57 + b); c.stroke(); c.restore();
    ell(c, -9, -44 + b, 5, 2.4, Br, .4);
    ell(c, -18, -40 + b, 9, 8, Br);
    ell(c, -24, -36 + b, 5, 4, Cr);
    circ(c, -28, -37 + b, 3.2, '#ff5d5d');
    eye(c, -18, -42 + b, 2.2); blush(c, -14, -37 + b, 2);
  },

  // ======== BÃI BIỂN ========
  // 11 CUA
  (c, b, l1, l2) => {
    const R = '#ff8a6b', R2 = '#f06e52';
    c.save(); c.strokeStyle = R2; c.lineWidth = 2.6;
    for (const s of [-1, 1]) for (const k of [0, 1, 2]) { const l = (k % 2 ? l1 : l2); c.beginPath(); c.moveTo(s * 8, -7); c.lineTo(s * (15 + k * 2), -3 + l + k * 2); c.lineTo(s * (17 + k * 2), 1 + l); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(-6, -12 + b); c.lineTo(-17, -20 + b); c.moveTo(6, -12 + b); c.lineTo(17, -20 + b); c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 19, -22 + b, 6, 0, TAU); c.fillStyle = R; c.fill(); c.stroke(); c.beginPath(); c.moveTo(s * 19, -22 + b); c.lineTo(s * 25, -26 + b); c.stroke(); }
    ell(c, 0, -10 + b, 14, 8.5, R);
    c.beginPath(); c.moveTo(-4, -17 + b); c.lineTo(-5, -23 + b); c.moveTo(4, -17 + b); c.lineTo(5, -23 + b); c.stroke();
    circ(c, -5, -25 + b, 3.4, '#fff'); circ(c, 5, -25 + b, 3.4, '#fff');
    dot(c, -5.5, -25 + b, 1.7, INK); dot(c, 4.5, -25 + b, 1.7, INK);
    blush(c, -8, -9 + b, 2.2); blush(c, 8, -9 + b, 2.2);
    c.beginPath(); c.arc(0, -10 + b, 2.5, .2, Math.PI - .2); c.stroke();
  },
  // 12 RÙA BIỂN
  (c, b, l1, l2) => {
    const G = '#8fd48a', SH = '#5fb88a';
    ell(c, 10, -4 + l2, 6, 3, G, .5); ell(c, -10, -4 + l1, 6, 3, G, -.5);
    poly(c, [15, -8 + b, 22, -6 + b, 15, -4 + b], G);
    circ(c, -18, -12 + b, 7, G);
    eye(c, -20, -14 + b, 2); blush(c, -16, -10 + b, 1.8);
    c.beginPath(); c.ellipse(0, -8 + b, 16, 13, 0, Math.PI, TAU); c.closePath(); c.fillStyle = SH; c.fill(); c.stroke();
    c.save(); c.strokeStyle = '#3e9a6c'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-6, -8 + b); c.lineTo(-4, -16 + b); c.lineTo(4, -16 + b); c.lineTo(6, -8 + b); c.moveTo(-4, -16 + b); c.lineTo(-10, -18 + b); c.moveTo(4, -16 + b); c.lineTo(10, -18 + b); c.stroke(); c.restore();
    rrect(c, -17, -9 + b, 34, 5, 2.5, '#ffe9a8');
  },
  // 13 HẢI ÂU
  (c, b, l1, l2) => {
    const Wc = '#fffdf8', Gr = '#b9c3d4', O = '#ffa94d';
    c.save(); c.strokeStyle = O; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(-2, -7); c.lineTo(-3, l1); c.moveTo(4, -7); c.lineTo(5, l2); c.stroke(); c.restore();
    poly(c, [10, -16 + b, 19, -18 + b, 14, -11 + b], Gr);
    ell(c, 1, -14 + b, 12, 8.5, Wc);
    ell(c, 4, -15 + b, 9, 5, Gr, .2);
    circ(c, -8, -23 + b, 7, Wc);
    poly(c, [-14, -24 + b, -21, -22 + b, -14, -20 + b], '#ffd36e');
    dot(c, -18, -22 + b, 1.2, '#ff6b6b');
    eye(c, -9, -25 + b, 1.9);
  },
  // 14 HỒNG HẠC
  (c, b, l1, l2) => {
    const P = '#ffa3c2', P2 = '#ff86ad';
    c.save(); c.strokeStyle = P2; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(2, -26); c.lineTo(1, l1); c.moveTo(4, -26); c.lineTo(9, -16 + l2); c.lineTo(3, -12 + l2); c.stroke(); c.restore();
    poly(c, [12, -33 + b, 20, -36 + b, 15, -27 + b], P2);
    ell(c, 3, -32 + b, 12, 8, P);
    ell(c, 6, -33 + b, 7, 4.5, P2, .2);
    c.beginPath(); c.moveTo(-6, -32 + b); c.quadraticCurveTo(-14, -38 + b, -6, -44 + b); c.quadraticCurveTo(0, -50 + b, -8, -52 + b);
    c.lineWidth = 7.5; c.stroke(); c.lineWidth = 4; c.strokeStyle = P; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = INK;
    circ(c, -9, -52 + b, 5.5, P);
    c.beginPath(); c.moveTo(-13, -53 + b); c.quadraticCurveTo(-20, -52 + b, -19, -45 + b); c.lineTo(-14, -49 + b); c.closePath(); c.fillStyle = '#fff3e6'; c.fill(); c.stroke();
    dot(c, -18.5, -46.5 + b, 2, INK);
    eye(c, -9, -54 + b, 1.8);
  },
  // 15 RÁI CÁ
  (c, b, l1, l2) => {
    const Br = '#b98763', Cr = '#f3dcc0';
    c.beginPath(); c.moveTo(12, -8 + b); c.quadraticCurveTo(26, -8, 27, -2); c.quadraticCurveTo(20, -3, 12, -3); c.closePath(); c.fillStyle = Br; c.fill(); c.stroke();
    ell(c, 6, -2 + l2, 5, 2.6, Br); ell(c, -8, -2 + l1, 5, 2.6, Br);
    ell(c, 1, -11 + b, 14, 9, Br);
    ell(c, -3, -10 + b, 8, 6, Cr, 0, false);
    circ(c, -17, -25 + b, 3, Br); circ(c, -5, -26 + b, 3, Br);
    circ(c, -11, -19 + b, 9, Br);
    ell(c, -14, -16 + b, 6, 4.5, Cr);
    dot(c, -17, -18 + b, 1.8, INK);
    eye(c, -13, -22 + b, 2); eye(c, -6, -22 + b, 2);
    blush(c, -8, -16 + b, 2);
  },
];

function stars(c, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + i * TAU / 3;
    star(c, x + Math.cos(a) * 12, y + Math.sin(a) * 4, 4.5, '#ffd36e');
  }
}
function zzz(c, x, y, t) {
  c.save(); c.font = '800 13px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = INK; c.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    const p = (t * .6 + i / 3) % 1;
    c.globalAlpha = Math.sin(p * Math.PI);
    c.font = `800 ${10 + p * 8}px "Baloo 2",sans-serif`;
    c.strokeText('z', x + p * 14, y - p * 22); c.fillText('z', x + p * 14, y - p * 22);
  }
  c.restore();
}
function star(c, x, y, r, fill) {
  c.save(); c.lineWidth = 1.6; c.strokeStyle = INK; c.lineJoin = 'round';
  const p = [];
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = -Math.PI / 2 + i * Math.PI / 5; p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  poly(c, p, fill); c.restore();
}
function heart(c, x, y, s, fill = '#ff6b8b') {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 2 / s; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(0, 4); c.bezierCurveTo(-8, -2, -5, -9, 0, -5); c.bezierCurveTo(5, -9, 8, -2, 0, 4);
  c.fillStyle = fill; c.fill(); c.stroke(); c.restore();
}

// ---------------- NÔNG DÂN + SÚNG NƯỚC ----------------
function drawFarmer(c, x, y, o = {}) {
  const ang = o.ang || 0, ph = o.phase || 0, mv = !!o.moving, s = o.scale || 1;
  const right = Math.cos(ang) >= 0;
  const l1 = mv ? -Math.max(0, Math.sin(ph)) * 3 : 0, l2 = mv ? -Math.max(0, -Math.sin(ph)) * 3 : 0;
  const b = mv ? -Math.abs(Math.sin(ph)) * 1.5 : 0;
  c.save(); c.translate(x, y); c.scale(s, s);
  shadow(c, 0, 0, 16);
  c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
  const B = '#7b9cff', R = '#ff7b7b', SK = '#ffd7b5', H = '#ffd36e';
  rrect(c, -8, -12 + l1, 7, 12, 3, B); rrect(c, 1, -12 + l2, 7, 12, 3, B);
  ell(c, -4.5, -1 + l1, 5, 3, '#a0715a'); ell(c, 4.5, -1 + l2, 5, 3, '#a0715a');
  rrect(c, -11, -32 + b, 22, 22, 8, R);
  rrect(c, -8, -26 + b, 16, 16, 4, B);
  dot(c, -4.5, -23 + b, 1.6, H); dot(c, 4.5, -23 + b, 1.6, H);
  const fx = right ? 3 : -3;
  circ(c, 0, -43 + b, 11, SK);
  eye(c, -4 + fx, -43 + b, 2.2); eye(c, 4 + fx, -43 + b, 2.2);
  blush(c, -7 + fx, -39 + b, 2.2); blush(c, 7 + fx, -39 + b, 2.2);
  c.beginPath(); c.arc(fx, -39.5 + b, 2.5, .2, Math.PI - .2); c.stroke();
  ell(c, 0, -51 + b, 18, 5, H);
  rrect(c, -9, -62 + b, 18, 12, 6, H);
  c.fillStyle = R; c.fillRect(-8, -54.5 + b, 16, 3);
  if (!o.noGun) { // súng nước xoay theo hướng ngắm
    c.save(); c.translate(0, -24 + b); c.rotate(ang); if (!right) c.scale(1, -1);
    rrect(c, 18, -3, 16, 6, 3, '#4fd1c5');
    rrect(c, 32, -2.5, 4, 5, 1.5, H);
    rrect(c, 4, -6, 17, 11, 5, '#ff9fc4');
    circ(c, 11, -10, 5, '#9fe3ff');
    rrect(c, 7, 3, 6, 9, 2.5, '#ff9fc4');
    circ(c, 10, 4, 4, SK);
    c.restore();
  }
  c.restore();
}

// ---------------- AVATAR (cho UI) ----------------
// kind: 0..5 = con vật, 'farmer' = nông dân
function avatar(kind, size = 64, bg) {
  const cv = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1);
  cv.width = cv.height = size * d; cv.style.width = cv.style.height = size + 'px'; cv.className = 'av';
  const c = cv.getContext('2d'); c.scale(d, d);
  c.fillStyle = bg || (kind === 'farmer' ? '#e6f4ff' : AVATAR_BG[kind] || '#fff'); c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, TAU); c.clip();
  const k = size / 64;
  if (kind === 'farmer') drawFarmer(c, size / 2, size * 1.02, { scale: 1.05 * k, ang: 0.3 });
  else drawAnimal(c, kind, size / 2 + 4 * k, size * (ANIMAL_H[kind] > 44 ? .9 : .78),
    { scale: [1.35, 1.05, 1.3, 1.3, 1.55, 1.2, 1.25, 1.2, 1.3, 1.3, .9, 1.5, 1.5, 1.35, .85, 1.4][kind] * k });
  c.restore();
  return cv;
}
