// Trốn Tìm — vẽ 3 bản đồ: Nông trại, Làng tuyết, Bãi biển.
// build(map) dựng nền tĩnh 1 lần mỗi ván; tree/bush là sprite vẽ đè lên thú (chỗ trốn).
window.HSThemes = (() => {
  const SS = 2; // độ nét của sprite

  // ---------- tiện ích chung ----------
  function smoothPath(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
  }
  function blockedAt(m, x, y, pad) {
    for (const b of m.buildings) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    for (const s of m.seas) if (y > s.y - pad) return true;
    for (const p of m.ponds) { const dx = (x - p.cx) / (p.rx + pad), dy = (y - p.cy) / (p.ry + pad); if (dx * dx + dy * dy < 1) return true; }
    return false;
  }
  function ground(g, m, r, base, light, dark) {
    g.fillStyle = base; g.fillRect(0, 0, m.W, m.H);
    for (let i = 0; i < m.W * m.H / 9000; i++) {
      g.fillStyle = r() < .5 ? light : dark;
      g.beginPath(); g.ellipse(r() * m.W, r() * m.H, 40 + r() * 110, 30 + r() * 70, r() * 3, 0, TAU); g.fill();
    }
  }
  function scatter(g, m, r, n, pad, fn) {
    for (let i = 0; i < n; i++) { const x = r() * m.W, y = r() * m.H; if (!blockedAt(m, x, y, pad)) fn(x, y, i); }
  }
  function clusters(g, m, r, n, fn) {
    for (let i = 0; i < n; i++) {
      const cx = r() * m.W, cy = r() * m.H, v = r() * 5 | 0;
      for (let k = 0; k < 6; k++) { const x = cx + (r() - .5) * 60, y = cy + (r() - .5) * 40; if (!blockedAt(m, x, y, 30)) fn(x, y, v); }
    }
  }
  function tuft(g, x, y, col) {
    g.strokeStyle = col; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 6, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9); g.moveTo(x + 4, y); g.lineTo(x + 6, y - 7); g.stroke();
  }
  function flower(g, x, y, col) {
    g.fillStyle = col;
    for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(x + Math.cos(a * 1.26) * 3.4, y + Math.sin(a * 1.26) * 3.4, 2.8, 0, TAU); g.fill(); }
    g.fillStyle = '#ffb347'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  }
  function sparkle(g, x, y, s, col) {
    g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
  }
  function groundShadow(g, x, y, rx, ry) { g.fillStyle = 'rgba(40,60,40,.18)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  function paths(g, m, outer, inner, wo = 80, wi = 66) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const p of m.paths) { smoothPath(g, p); g.strokeStyle = outer; g.lineWidth = wo; g.stroke(); }
    for (const p of m.paths) { smoothPath(g, p); g.strokeStyle = inner; g.lineWidth = wi; g.stroke(); }
  }
  function along(m, r, fn, n) {
    for (let i = 0; i < n; i++) {
      const p = m.paths[i % m.paths.length], k = r() * (p.length - 1) | 0, t = r();
      fn(p[k][0] + (p[k + 1][0] - p[k][0]) * t + (r() - .5) * 50, p[k][1] + (p[k + 1][1] - p[k][1]) * t + (r() - .5) * 50);
    }
  }
  function woodFence(g, m, snow) {
    g.save(); g.lineWidth = 2.6; g.strokeStyle = INK;
    const W = m.W, H = m.H;
    const rail = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = 9; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4.5; g.strokeStyle = '#e0ad7a'; g.stroke(); };
    for (const yy of [30, 46]) { rail(24, yy, W - 24, yy); rail(24, H - 64 + yy, W - 24, H - 64 + yy); }
    rail(24, 30, 24, H - 18); rail(W - 24, 30, W - 24, H - 18);
    g.strokeStyle = INK; g.lineWidth = 2.6;
    const post = (x, y, w, h) => { rrect(g, x, y, w, h, 4, '#c99868'); if (snow) ell(g, x + w / 2, y + 1, w / 2 + 3, 5, '#fff'); };
    for (let x = 24; x <= W - 20; x += 64) { post(x - 6, 16, 12, 40); post(x - 6, H - 44, 12, 40); }
    for (let y = 80; y <= H - 60; y += 64) { post(18, y - 6, 12, 22); post(W - 30, y - 6, 12, 22); }
    g.restore();
  }

  // =================== NÔNG TRẠI ===================
  const farm = {
    fp: 'rgba(120,85,50,.55)', mini: '#4ba87a',
    bg(g, m, r) {
      ground(g, m, r, '#9ddf8f', 'rgba(255,255,255,.07)', 'rgba(60,140,70,.06)');
      paths(g, m, '#dcbb83', '#f1dcae');
      along(m, r, (x, y) => { g.fillStyle = 'rgba(180,140,90,.35)'; g.beginPath(); g.ellipse(x, y, 3 + r() * 3, 2 + r() * 2, 0, 0, TAU); g.fill(); }, 260);
      for (const f of m.patches) farm.field(g, f, r);
      for (const p of m.ponds) farm.pond(g, p, r);
      scatter(g, m, r, m.W * m.H / 3000, 30, (x, y) => tuft(g, x, y, 'rgba(60,140,70,.55)'));
      const cols = ['#ffffff', '#ffd36e', '#ff9fc4', '#c7a8ff', '#9fd8ff'];
      clusters(g, m, r, 160, (x, y, v) => flower(g, x, y, cols[v]));
      for (const [x, y, v] of m.rocks) farm.rock(g, x, y, v);
      for (const [x, y] of m.props) farm.hay(g, x, y);
      for (const b of m.buildings) farm.barn(g, b);
      woodFence(g, m);
    },
    field(g, f, r) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK;
      rrect(g, f.x, f.y, f.w, f.h, 24, '#d39a66');
      for (let y = f.y + 34; y < f.y + f.h - 18; y += 46) {
        g.fillStyle = '#bf8553'; g.beginPath(); g.roundRect(f.x + 16, y - 9, f.w - 32, 18, 9); g.fill();
        for (let x = f.x + 34; x < f.x + f.w - 24; x += 36) {
          const jx = x + (r() - .5) * 6, k = f.kind % 3;
          g.lineWidth = 2; g.strokeStyle = INK;
          if (k === 0) {
            poly(g, [jx - 5, y - 2, jx + 5, y - 2, jx, y + 8], '#ff9f43');
            g.strokeStyle = '#4fae6a'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(jx, y - 2); g.lineTo(jx - 6, y - 14); g.moveTo(jx, y - 2); g.lineTo(jx, y - 16); g.moveTo(jx, y - 2); g.lineTo(jx + 6, y - 14); g.stroke();
          } else if (k === 1) {
            g.strokeStyle = '#e9b443'; g.lineWidth = 3;
            for (const o of [-6, 0, 6]) { g.beginPath(); g.moveTo(jx + o * .5, y + 4); g.lineTo(jx + o, y - 16); g.stroke(); }
            g.strokeStyle = INK; g.lineWidth = 1.8;
            for (const o of [-6, 0, 6]) ell(g, jx + o, y - 18, 3, 6, '#ffd36e');
          } else {
            cloud(g, [[jx - 5, y, 7], [jx + 5, y, 7], [jx, y - 6, 8]], '#8fdc7a');
            dot(g, jx, y - 3, 4, '#b5ea9f');
          }
        }
      }
      g.restore();
    },
    pond(g, p, r) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK;
      ell(g, p.cx, p.cy, p.rx + 22, p.ry + 18, '#f5e4b8');
      ell(g, p.cx, p.cy, p.rx, p.ry, '#86d3f7');
      ell(g, p.cx + 10, p.cy + 8, p.rx * .7, p.ry * .62, '#72c5f0', 0, false);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const x = p.cx + (r() - .5) * p.rx * 1.1, y = p.cy + (r() - .5) * p.ry * 1.1; g.beginPath(); g.arc(x, y, 14 + r() * 16, Math.PI * 1.15, Math.PI * 1.75); g.stroke(); }
      g.strokeStyle = INK; g.lineWidth = 2.4;
      for (let i = 0; i < 5; i++) {
        const a = r() * TAU, d = .35 + r() * .45, x = p.cx + Math.cos(a) * p.rx * d, y = p.cy + Math.sin(a) * p.ry * d;
        g.beginPath(); g.arc(x, y, 13, .5, TAU - .2); g.lineTo(x, y); g.closePath(); g.fillStyle = '#6fcf7f'; g.fill(); g.stroke();
        if (r() < .5) { circ(g, x + 4, y - 3, 4, '#ffb3cf'); dot(g, x + 4, y - 3, 1.6, '#ffd36e'); }
      }
      for (let i = 0; i < 7; i++) {
        const a = r() * TAU, x = p.cx + Math.cos(a) * (p.rx + 6), y = p.cy + Math.sin(a) * (p.ry + 4);
        g.strokeStyle = '#4fae6a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 26); g.moveTo(x + 5, y); g.lineTo(x + 7, y - 20); g.stroke();
        g.strokeStyle = INK; g.lineWidth = 2; ell(g, x - 3, y - 28, 3, 7, '#a0715a');
      }
      g.restore();
    },
    barn(g, b) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK; g.lineJoin = 'round';
      groundShadow(g, b.x + b.w / 2 + 10, b.y + b.h, b.w / 2 + 20, 26);
      const sx = b.x + b.w - 66, sw = 62;
      rrect(g, sx, b.y + 40, sw, b.h - 40, 10, '#e4e0f0');
      for (let y = b.y + 70; y < b.y + b.h - 10; y += 28) { g.beginPath(); g.moveTo(sx + 3, y); g.lineTo(sx + sw - 3, y); g.stroke(); }
      g.beginPath(); g.ellipse(sx + sw / 2, b.y + 42, sw / 2, 28, 0, Math.PI, TAU); g.fillStyle = '#b8b0d8'; g.fill(); g.stroke();
      const bw = b.w - 74, top = b.y + 70;
      rrect(g, b.x, top, bw, b.h - 70, 6, '#ff7b7b');
      g.save(); g.strokeStyle = 'rgba(74,59,82,.18)'; g.lineWidth = 2;
      for (let x = b.x + 18; x < b.x + bw; x += 18) { g.beginPath(); g.moveTo(x, top + 4); g.lineTo(x, b.y + b.h - 4); g.stroke(); }
      g.restore();
      poly(g, [b.x - 14, top + 6, b.x + 20, b.y + 18, b.x + bw / 2, b.y - 6, b.x + bw - 20, b.y + 18, b.x + bw + 14, top + 6], '#c95b6b');
      g.save(); g.strokeStyle = '#fff'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(b.x - 6, top + 2); g.lineTo(b.x + 22, b.y + 24); g.lineTo(b.x + bw / 2, b.y + 4); g.lineTo(b.x + bw - 22, b.y + 24); g.lineTo(b.x + bw + 6, top + 2); g.stroke(); g.restore();
      rrect(g, b.x + bw / 2 - 20, b.y + 36, 40, 30, 6, '#fffaf2');
      g.beginPath(); g.moveTo(b.x + bw / 2, b.y + 36); g.lineTo(b.x + bw / 2, b.y + 66); g.moveTo(b.x + bw / 2 - 20, b.y + 51); g.lineTo(b.x + bw / 2 + 20, b.y + 51); g.stroke();
      const dw = 92, dh = 96, dx = b.x + bw / 2 - dw / 2, dy = b.y + b.h - dh;
      rrect(g, dx, dy, dw, dh, 4, '#fffaf2');
      g.save(); g.strokeStyle = '#ff7b7b'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(dx + 8, dy + 8); g.lineTo(dx + dw - 8, dy + dh - 8); g.moveTo(dx + dw - 8, dy + 8); g.lineTo(dx + 8, dy + dh - 8); g.stroke(); g.restore();
      g.strokeRect(dx, dy, dw, dh);
      g.restore();
    },
    hay(g, x, y) {
      g.save(); g.lineWidth = 2.6; g.strokeStyle = INK;
      groundShadow(g, x + 4, y + 2, 38, 10);
      rrect(g, x - 34, y - 40, 52, 40, 12, '#ffd36e');
      ell(g, x + 18, y - 20, 14, 20, '#ffe08f');
      g.beginPath(); g.arc(x + 18, y - 20, 8, 0, 5); g.stroke();
      g.strokeStyle = '#e9b443'; g.lineWidth = 2;
      for (const yy of [-30, -18, -8]) { g.beginPath(); g.moveTo(x - 28, y + yy); g.lineTo(x + 2, y + yy); g.stroke(); }
      g.restore();
    },
    rock(g, x, y, v) {
      g.save(); g.lineWidth = 2.4; g.strokeStyle = INK;
      groundShadow(g, x + 3, y + 2, 20, 6);
      ell(g, x, y - 8, 16 + v * 2, 11 + v, '#d6d0e2');
      if (v % 2) ell(g, x + 16, y - 4, 9, 7, '#d6d0e2');
      dot(g, x - 5, y - 13, 4, 'rgba(255,255,255,.6)');
      g.restore();
    },
    tree(c, v) {
      c.lineWidth = 2.6; c.lineJoin = 'round'; c.strokeStyle = INK;
      groundShadow(c, 6, 2, 58, 17);
      c.translate(0, -40);
      rrect(c, -9, 0, 18, 44, 6, '#c08a5b');
      const [g1, g2, g3] = [['#6cc77e', '#58b06c', '#8fdc9b'], ['#7fcf7a', '#66b862', '#a5e39c'], ['#5fbf8f', '#4ba87a', '#86d8ad'], ['#8ccf6a', '#74b856', '#b0e48f']][v];
      if (v === 3) { for (let i = 0; i < 3; i++) poly(c, [-48 + i * 9, 10 - i * 26, 0, -40 - i * 26, 48 - i * 9, 10 - i * 26], i ? g1 : g2); return; }
      cloud(c, [[-30, -6, 32], [28, -4, 34], [0, -32, 38], [0, 6, 36]], g1);
      c.save(); c.beginPath(); c.arc(0, 6, 34, 0, Math.PI); c.fillStyle = g2; c.globalAlpha = .45; c.fill(); c.restore();
      dot(c, -14, -42, 12, g3); dot(c, 14, -26, 6, g3);
      if (v === 0) for (const [fx, fy] of [[-22, -18], [18, -34], [24, 8], [-6, 4], [-30, 6]]) circ(c, fx, fy, 4.5, '#ff7b8b');
      if (v === 2) for (const [fx, fy] of [[-20, -20], [20, -30], [22, 6], [-4, -8]]) { circ(c, fx, fy, 3, '#fff'); dot(c, fx, fy, 1.4, '#ffd36e'); }
    },
    bush(c, v) {
      c.lineWidth = 2.4; c.lineJoin = 'round'; c.strokeStyle = INK;
      groundShadow(c, 4, 8, 36, 10);
      cloud(c, [[-16, -2, 16], [14, -2, 17], [0, -14, 19], [0, 2, 17]], ['#7ad48a', '#86d47a', '#6ccc9a', '#9ad67a'][v]);
      dot(c, -6, -20, 6, 'rgba(255,255,255,.3)');
      for (const [fx, fy] of [[-14, -6], [10, -12], [16, 2], [-2, -2]]) circ(c, fx, fy, 3, ['#ff7b8b', '#a98bff', '#ffd36e', '#ff9fc4'][v]);
    },
  };

  // =================== LÀNG TUYẾT ===================
  const snow = {
    fp: 'rgba(110,140,180,.6)', mini: '#3f9a73',
    bg(g, m, r) {
      ground(g, m, r, '#eaf3fb', 'rgba(255,255,255,.6)', 'rgba(150,190,230,.10)');
      paths(g, m, '#cfdcea', '#dde7f2');
      along(m, r, (x, y) => { g.fillStyle = 'rgba(140,165,200,.35)'; g.beginPath(); g.ellipse(x, y, 4, 2.5, r(), 0, TAU); g.fill(); }, 300);
      for (const f of m.patches) snow.garden(g, f, r);
      for (const p of m.ponds) snow.lake(g, p, r);
      scatter(g, m, r, m.W * m.H / 5000, 30, (x, y, i) => i % 3 ? sparkle(g, x, y, 3 + (i % 3), 'rgba(140,180,225,.55)') : tuft(g, x, y, 'rgba(110,150,130,.45)'));
      clusters(g, m, r, 70, (x, y, v) => { g.fillStyle = v < 2 ? '#ff6b6b' : '#ffffff'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); });
      for (const [x, y, v] of m.rocks) snow.rock(g, x, y, v);
      for (const [x, y, v] of m.props) snow.prop(g, x, y, v);
      for (const b of m.buildings) snow.cabin(g, b);
      woodFence(g, m, true);
    },
    garden(g, f, r) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK;
      rrect(g, f.x, f.y, f.w, f.h, 24, '#f8fbff');
      g.strokeStyle = '#c99868'; g.lineWidth = 4; g.setLineDash([14, 10]); g.beginPath(); g.roundRect(f.x + 8, f.y + 8, f.w - 16, f.h - 16, 18); g.stroke(); g.setLineDash([]);
      g.strokeStyle = INK; g.lineWidth = 2;
      for (let y = f.y + 46; y < f.y + f.h - 20; y += 52) for (let x = f.x + 40; x < f.x + f.w - 30; x += 46) {
        const jx = x + (r() - .5) * 8;
        if (f.kind % 2) { // cây thông con
          poly(g, [jx - 12, y + 4, jx, y - 22, jx + 12, y + 4], '#3f9a73');
          poly(g, [jx - 6, y - 10, jx, y - 22, jx + 6, y - 10], '#fff');
          if (r() < .4) circ(g, jx + 4, y - 4, 2.5, '#ff6b6b');
        } else { // ụ tuyết có lá xanh
          ell(g, jx, y, 14, 9, '#fff');
          g.strokeStyle = '#4fae6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(jx - 3, y - 7); g.lineTo(jx - 6, y - 15); g.moveTo(jx + 3, y - 7); g.lineTo(jx + 6, y - 14); g.stroke();
          g.strokeStyle = INK; g.lineWidth = 2;
        }
      }
      g.restore();
    },
    lake(g, p, r) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK;
      ell(g, p.cx, p.cy, p.rx + 20, p.ry + 16, '#ffffff');
      ell(g, p.cx, p.cy, p.rx, p.ry, '#bfe5f6');
      ell(g, p.cx - p.rx * .15, p.cy - p.ry * .2, p.rx * .55, p.ry * .4, '#d8f1fb', -.2, false);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const x = p.cx + (r() - .5) * p.rx, y = p.cy + (r() - .5) * p.ry; g.beginPath(); g.ellipse(x, y, 30 + r() * 30, 12 + r() * 10, r() * 3, 0, Math.PI * 1.3); g.stroke(); }
      g.strokeStyle = 'rgba(90,150,200,.5)'; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        let x = p.cx + (r() - .5) * p.rx, y = p.cy + (r() - .5) * p.ry;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (r() - .5) * 40; y += (r() - .5) * 26; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
    },
    cabin(g, b) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK; g.lineJoin = 'round';
      groundShadow(g, b.x + b.w / 2 + 10, b.y + b.h, b.w / 2 + 20, 24);
      const top = b.y + 86;
      rrect(g, b.x + 10, top, b.w - 20, b.h - 86, 6, '#c58b5c');
      g.save(); g.strokeStyle = 'rgba(74,59,82,.3)'; g.lineWidth = 2;
      for (let y = top + 16; y < b.y + b.h - 4; y += 16) { g.beginPath(); g.moveTo(b.x + 14, y); g.lineTo(b.x + b.w - 14, y); g.stroke(); }
      g.restore();
      for (let y = top + 8; y < b.y + b.h - 4; y += 16) { circ(g, b.x + 10, y, 6, '#e0ad7a'); circ(g, b.x + b.w - 10, y, 6, '#e0ad7a'); }
      rrect(g, b.x + b.w - 70, b.y + 8, 26, 50, 3, '#b07a6a');
      ell(g, b.x + b.w - 57, b.y + 8, 17, 7, '#fff');
      for (let i = 0; i < 3; i++) dot(g, b.x + b.w - 50 + i * 12, b.y - 10 - i * 16, 9 + i * 3, 'rgba(220,226,238,.85)');
      poly(g, [b.x - 16, top + 6, b.x + b.w / 2, b.y + 6, b.x + b.w + 16, top + 6], '#8a5a44');
      g.beginPath(); g.moveTo(b.x - 16, top + 6); g.lineTo(b.x + b.w / 2, b.y + 6); g.lineTo(b.x + b.w + 16, top + 6);
      for (let x = b.x + b.w + 16; x > b.x - 16; x -= 20) g.quadraticCurveTo(x - 10, top - 10, x - 20, top - 2);
      g.closePath(); g.fillStyle = '#fff'; g.fill(); g.stroke();
      for (let x = b.x; x < b.x + b.w; x += 22) poly(g, [x, top + 6, x + 8, top + 6, x + 4, top + 18 + (x % 3) * 3], '#cfeefc');
      const ww = 38, wy = top + 26;
      for (const wx of [b.x + 28, b.x + b.w - 28 - ww]) {
        rrect(g, wx, wy, ww, 32, 5, '#ffe08a');
        g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + 32); g.moveTo(wx, wy + 16); g.lineTo(wx + ww, wy + 16); g.stroke();
        ell(g, wx + ww / 2, wy, ww / 2 + 4, 5, '#fff');
      }
      const dw = 50, dh = 70, dx = b.x + b.w / 2 - dw / 2;
      rrect(g, dx, b.y + b.h - dh, dw, dh, [20, 20, 2, 2], '#8a5a44');
      g.lineWidth = 5; g.strokeStyle = '#4fae6a'; g.beginPath(); g.arc(b.x + b.w / 2, b.y + b.h - dh + 24, 11, 0, TAU); g.stroke();
      g.lineWidth = 2; g.strokeStyle = INK; circ(g, b.x + b.w / 2, b.y + b.h - dh + 35, 4, '#ff6b6b');
      dot(g, dx + dw - 10, b.y + b.h - 34, 3, '#ffd36e');
      g.restore();
    },
    rock(g, x, y, v) {
      g.save(); g.lineWidth = 2.4; g.strokeStyle = INK;
      groundShadow(g, x + 3, y + 2, 20, 6);
      ell(g, x, y - 8, 16 + v * 2, 11 + v, '#b9b6cc');
      g.beginPath(); g.ellipse(x - 1, y - 14 - v * .5, 12 + v * 2, 6, 0, Math.PI, TAU); g.fillStyle = '#fff'; g.fill(); g.stroke();
      g.restore();
    },
    prop(g, x, y, v) {
      g.save(); g.lineWidth = 2.6; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
      groundShadow(g, x + 3, y, 26, 8);
      if (v < 2) { // người tuyết
        g.strokeStyle = '#8a5a44'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x - 14, y - 34); g.lineTo(x - 30, y - 46); g.moveTo(x + 14, y - 34); g.lineTo(x + 30, y - 48); g.stroke();
        g.strokeStyle = INK; g.lineWidth = 2.6;
        circ(g, x, y - 18, 19, '#fff'); circ(g, x, y - 48, 14, '#fff');
        rrect(g, x - 15, y - 38, 30, 7, 3, v ? '#7b9cff' : '#ff6b6b');
        rrect(g, x + 4, y - 38, 7, 16, 3, v ? '#7b9cff' : '#ff6b6b');
        dot(g, x - 5, y - 51, 2.2, INK); dot(g, x + 5, y - 51, 2.2, INK);
        poly(g, [x, y - 47, x + 13, y - 45, x, y - 43], '#ff9f43');
        dot(g, x, y - 22, 2.4, INK); dot(g, x, y - 13, 2.4, INK);
        if (v) { rrect(g, x - 11, y - 70, 22, 10, 3, '#4a3b52'); rrect(g, x - 15, y - 62, 30, 4, 2, '#4a3b52'); }
      } else if (v === 2) { // xe trượt
        rrect(g, x - 30, y - 20, 56, 14, 6, '#ff6b6b');
        g.strokeStyle = '#8a5a44'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 32, y - 2); g.lineTo(x + 26, y - 2); g.quadraticCurveTo(x + 38, y - 2, x + 36, y - 14); g.stroke();
      } else { // hộp quà
        rrect(g, x - 24, y - 26, 28, 26, 4, '#ff8fb1'); rrect(g, x + 2, y - 18, 22, 18, 4, '#7fd6a6');
        g.fillStyle = '#ffd36e'; g.fillRect(x - 12, y - 26, 5, 26); g.fillRect(x + 11, y - 18, 5, 18);
        circ(g, x - 10, y - 30, 5, '#ffd36e');
      }
      g.restore();
    },
    tree(c, v) {
      c.lineWidth = 2.6; c.lineJoin = 'round'; c.strokeStyle = INK;
      groundShadow(c, 6, 2, 52, 15);
      if (v === 2) { // cây tròn phủ tuyết
        c.translate(0, -40);
        rrect(c, -9, 0, 18, 44, 6, '#a0715a');
        cloud(c, [[-30, -6, 32], [28, -4, 34], [0, -32, 38], [0, 6, 36]], '#f4f9ff');
        c.save(); c.beginPath(); c.arc(0, 8, 34, 0, Math.PI); c.fillStyle = '#cfe3f5'; c.globalAlpha = .6; c.fill(); c.restore();
        for (const [fx, fy] of [[-26, 0], [20, -20], [8, 14]]) dot(c, fx, fy, 5, '#5fae7f');
        return;
      }
      rrect(c, -8, -24, 16, 26, 5, '#a0715a');
      const H2 = v === 1 ? 1.15 : 1;
      for (let i = 0; i < 3; i++) {
        const w = (50 - i * 10), yb = -18 - i * 28 * H2, yt = yb - 46 * H2;
        poly(c, [-w, yb, 0, yt, w, yb], '#3f9a73');
        c.beginPath(); c.moveTo(-w * .55, yt + (yb - yt) * .55); c.lineTo(0, yt);
        c.lineTo(w * .55, yt + (yb - yt) * .55); c.quadraticCurveTo(w * .2, yt + (yb - yt) * .45, 0, yt + (yb - yt) * .6);
        c.quadraticCurveTo(-w * .2, yt + (yb - yt) * .45, -w * .55, yt + (yb - yt) * .55); c.fillStyle = '#fff'; c.fill(); c.stroke();
        if (v === 3) for (const [ox, oy] of [[-w * .5, -6], [w * .4, -10], [0, -16]]) circ(c, ox, yb + oy, 4, ['#ff6b6b', '#ffd36e', '#7b9cff'][(i + (ox > 0)) % 3]);
      }
      if (v === 3) star(c, 0, -18 - 2 * 28 - 48, 9, '#ffd36e');
    },
    bush(c, v) {
      c.lineWidth = 2.4; c.lineJoin = 'round'; c.strokeStyle = INK;
      groundShadow(c, 4, 8, 34, 10);
      cloud(c, [[-16, -2, 16], [14, -2, 17], [0, -14, 19], [0, 2, 17]], '#5fae7f');
      cloud(c, [[-12, -12, 10], [8, -18, 12], [16, -8, 8]], '#fff');
      for (const [fx, fy] of [[-14, 0], [12, 2], [2, -4]]) circ(c, fx, fy, 3.2, '#ff6b6b');
    },
  };

  // =================== BÃI BIỂN ===================
  const beach = {
    fp: 'rgba(170,120,60,.55)', mini: '#4fae6a',
    bg(g, m, r) {
      ground(g, m, r, '#f8e3ae', 'rgba(255,248,220,.35)', 'rgba(200,150,80,.07)');
      for (const s of m.seas) beach.sea(g, m, s, r);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const p of m.paths) { smoothPath(g, p); g.strokeStyle = INK; g.lineWidth = 60; g.stroke(); }
      for (const p of m.paths) { smoothPath(g, p); g.strokeStyle = '#dcae7c'; g.lineWidth = 54; g.stroke(); }
      g.setLineDash([3, 19]); g.lineCap = 'butt';
      for (const p of m.paths) { smoothPath(g, p); g.strokeStyle = '#b8845a'; g.lineWidth = 54; g.stroke(); }
      g.setLineDash([]);
      for (const f of m.patches) beach.patch(g, f, r);
      for (const p of m.ponds) beach.lagoon(g, p, r);
      scatter(g, m, r, m.W * m.H / 9000, 30, (x, y, i) => {
        if (i % 4 === 0) tuft(g, x, y, 'rgba(90,160,90,.55)');
        else { g.fillStyle = ['rgba(255,170,190,.8)', 'rgba(255,255,255,.85)', 'rgba(190,150,110,.5)'][i % 3]; g.beginPath(); g.ellipse(x, y, 3, 2, i, 0, TAU); g.fill(); }
      });
      clusters(g, m, r, 30, (x, y, v) => { if (v < 2) beach.starfish(g, x, y, 5, v ? '#ff9f43' : '#ff8fb1'); });
      for (const [x, y, v] of m.rocks) beach.rock(g, x, y, v);
      for (const [x, y, v] of m.props) beach.prop(g, x, y, v);
      for (const b of m.buildings) beach.hut(g, b);
      beach.rope(g, m);
    },
    starfish(g, x, y, s, col) {
      const p = [];
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * .45 : s, a = -Math.PI / 2 + i * Math.PI / 5; p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.save(); g.lineWidth = 1.5; g.strokeStyle = INK; g.lineJoin = 'round'; poly(g, p, col); g.restore();
    },
    sea(g, m, s, r) {
      g.save();
      g.fillStyle = '#ecd093'; g.fillRect(0, s.y - 46, m.W, 60);
      const grd = g.createLinearGradient(0, s.y, 0, m.H); grd.addColorStop(0, '#86d9f0'); grd.addColorStop(1, '#4fb3e0');
      g.beginPath(); g.moveTo(0, m.H);
      g.lineTo(0, s.y);
      for (let x = 0; x <= m.W; x += 60) g.quadraticCurveTo(x + 30, s.y + 14, x + 60, s.y);
      g.lineTo(m.W, m.H); g.closePath(); g.fillStyle = grd; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(0, s.y + 12);
      for (let x = 0; x <= m.W; x += 60) g.quadraticCurveTo(x + 30, s.y + 26, x + 60, s.y + 12);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < m.W / 40; i++) { const x = r() * m.W, y = s.y + 50 + r() * (m.H - s.y - 60); g.beginPath(); g.arc(x, y, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      g.restore();
    },
    lagoon(g, p, r) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK;
      ell(g, p.cx, p.cy, p.rx + 18, p.ry + 14, '#fff1cc');
      ell(g, p.cx, p.cy, p.rx, p.ry, '#8ee3e6');
      ell(g, p.cx + 8, p.cy + 6, p.rx * .62, p.ry * .55, '#6fd2da', 0, false);
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const x = p.cx + (r() - .5) * p.rx, y = p.cy + (r() - .5) * p.ry; g.beginPath(); g.arc(x, y, 14 + r() * 10, Math.PI * 1.15, Math.PI * 1.8); g.stroke(); }
      g.strokeStyle = INK; g.lineWidth = 2.4;
      for (let i = 0; i < 5; i++) { const a = r() * TAU; ell(g, p.cx + Math.cos(a) * (p.rx + 4), p.cy + Math.sin(a) * (p.ry + 2), 12, 8, '#b9b0a4'); }
      g.restore();
    },
    hut(g, b) {
      g.save(); g.lineWidth = 3; g.strokeStyle = INK; g.lineJoin = 'round';
      groundShadow(g, b.x + b.w / 2 + 10, b.y + b.h, b.w / 2 + 16, 22);
      const top = b.y + 80;
      rrect(g, b.x + 14, top, b.w - 28, b.h - 80, 6, '#efcf96');
      g.save(); g.strokeStyle = 'rgba(170,120,60,.45)'; g.lineWidth = 2;
      for (let x = b.x + 26; x < b.x + b.w - 14; x += 12) { g.beginPath(); g.moveTo(x, top + 4); g.lineTo(x, b.y + b.h - 4); g.stroke(); }
      g.restore();
      poly(g, [b.x - 20, top + 14, b.x + b.w / 2, b.y, b.x + b.w + 20, top + 14], '#f2c060');
      g.save(); g.strokeStyle = '#d59a3a'; g.lineWidth = 2.4;
      for (let i = 1; i < 6; i++) { const y = b.y + i * (top + 14 - b.y) / 6; const hw = (y - b.y) / (top + 14 - b.y) * (b.w / 2 + 20); g.beginPath(); g.moveTo(b.x + b.w / 2 - hw + 6, y); g.lineTo(b.x + b.w / 2 + hw - 6, y); g.stroke(); }
      g.restore();
      g.beginPath(); g.moveTo(b.x - 20, top + 14);
      for (let x = b.x - 20; x < b.x + b.w + 20; x += 14) g.lineTo(x + 7, top + 24), g.lineTo(x + 14, top + 14);
      g.fillStyle = '#f2c060'; g.fill(); g.stroke();
      const dw = 50, dh = 66, dx = b.x + b.w / 2 - dw / 2;
      rrect(g, dx, b.y + b.h - dh, dw, dh, [16, 16, 2, 2], '#7b5a8a');
      g.save(); g.strokeStyle = '#ff8fb1'; g.lineWidth = 4; for (let x = dx + 10; x < dx + dw; x += 12) { g.beginPath(); g.moveTo(x, b.y + b.h - dh + 8); g.lineTo(x, b.y + b.h - 4); g.stroke(); } g.restore();
      g.save(); g.translate(b.x + b.w - 26, b.y + b.h - 6); g.rotate(.18);
      rrect(g, -9, -76, 18, 76, 9, '#7fd6a6'); g.fillStyle = '#fff'; g.fillRect(-2, -72, 4, 68); g.restore();
      g.restore();
    },
    patch(g, f, r) {
      g.save(); g.lineWidth = 2.6; g.strokeStyle = INK; g.lineJoin = 'round';
      if (f.kind % 2) { // sân bóng chuyền
        g.fillStyle = 'rgba(255,240,200,.6)'; g.beginPath(); g.roundRect(f.x, f.y, f.w, f.h, 10); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(f.x + 12, f.y + 12, f.w - 24, f.h - 24);
        g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(f.x + f.w / 2, f.y); g.lineTo(f.x + f.w / 2, f.y + f.h); g.stroke();
        g.setLineDash([4, 4]); g.lineWidth = 2; g.beginPath(); g.moveTo(f.x + f.w / 2 - 4, f.y); g.lineTo(f.x + f.w / 2 - 4, f.y + f.h); g.stroke(); g.setLineDash([]);
        circ(g, f.x + f.w / 2, f.y, 6, '#fff'); circ(g, f.x + f.w / 2, f.y + f.h, 6, '#fff');
      } else { // khăn tắm + ô dù
        const cols = [['#ff8fb1', '#fff'], ['#7b9cff', '#fff'], ['#7fd6a6', '#ffd36e'], ['#ffd36e', '#ff9f43']];
        for (let i = 0; i < 4; i++) {
          const x = f.x + 30 + (i % 2) * (f.w / 2), y = f.y + 30 + (i >> 1) * (f.h / 2), [a, b2] = cols[(i + f.kind) % 4];
          g.save(); g.translate(x + 40, y + 40); g.rotate((r() - .5) * .4);
          rrect(g, -30, -44, 60, 88, 8, a);
          g.fillStyle = b2; for (let k = -30; k < 40; k += 20) g.fillRect(-28, k, 56, 8);
          g.strokeRect(-30, -44, 60, 88);
          g.restore();
          const ux = x + 100, uy = y + 30;
          g.save(); g.translate(ux, uy);
          for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 42, k * TAU / 8, (k + 1) * TAU / 8); g.closePath(); g.fillStyle = k % 2 ? '#fff' : a; g.fill(); }
          g.beginPath(); g.arc(0, 0, 42, 0, TAU); g.stroke(); circ(g, 0, 0, 5, '#ffd36e');
          g.restore();
        }
      }
      g.restore();
    },
    rock(g, x, y, v) {
      g.save(); g.lineWidth = 2.4; g.strokeStyle = INK;
      groundShadow(g, x + 3, y + 2, 20, 6);
      ell(g, x, y - 8, 16 + v * 2, 11 + v, '#c9bba8');
      if (v % 2) ell(g, x + 16, y - 4, 9, 7, '#c9bba8');
      dot(g, x - 5, y - 13, 4, 'rgba(255,255,255,.5)');
      if (v === 2) beach.starfish(g, x + 4, y - 12, 6, '#ff8fb1');
      g.restore();
    },
    prop(g, x, y, v) {
      g.save(); g.lineWidth = 2.6; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
      groundShadow(g, x + 3, y, 28, 8);
      if (v === 0) { // lâu đài cát
        rrect(g, x - 26, y - 26, 52, 26, 4, '#f0c87e');
        for (const ox of [-26, 10]) { rrect(g, x + ox, y - 44, 16, 44, 3, '#f0c87e'); for (let k = 0; k < 3; k++) g.fillRect(x + ox + 1 + k * 5.5, y - 48, 3.5, 5); }
        rrect(g, x - 8, y - 14, 16, 14, [8, 8, 0, 0], '#b88a5e');
        g.beginPath(); g.moveTo(x + 18, y - 46); g.lineTo(x + 18, y - 64); g.stroke(); poly(g, [x + 18, y - 64, x + 30, y - 59, x + 18, y - 54], '#ff6b8b');
      } else if (v === 1) { // bóng biển
        g.save(); g.beginPath(); g.arc(x, y - 16, 16, 0, TAU); g.clip();
        ['#ff6b8b', '#fff', '#7b9cff', '#fff', '#ffd36e', '#fff'].forEach((col, k) => { g.beginPath(); g.moveTo(x, y - 16); g.arc(x, y - 16, 16, k * TAU / 6, (k + 1) * TAU / 6); g.fillStyle = col; g.fill(); });
        g.restore(); circ(g, x, y - 16, 16); dot(g, x - 5, y - 22, 3, 'rgba(255,255,255,.8)');
      } else if (v === 2) { // xô + xẻng
        poly(g, [x - 16, y - 28, x + 16, y - 28, x + 12, y, x - 12, y], '#7b9cff');
        ell(g, x, y - 28, 16, 5, '#5e7fe6');
        g.beginPath(); g.arc(x, y - 28, 14, Math.PI, TAU); g.stroke();
        g.strokeStyle = '#ff9f43'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 18, y - 4); g.lineTo(x + 30, y - 34); g.stroke();
      } else { // ván lướt cắm cát
        g.save(); g.translate(x, y); g.rotate(-.12);
        rrect(g, -11, -84, 22, 84, 11, '#ff8fb1'); g.fillStyle = '#fff'; g.fillRect(-2, -80, 4, 76); g.restore();
      }
      g.restore();
    },
    rope(g, m) {
      g.save(); g.lineWidth = 2.6; g.strokeStyle = INK;
      const sea = m.seas[0] ? m.seas[0].y - 40 : m.H - 20;
      const ropeLine = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 10, x2, y2); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#f3dfb0'; g.stroke(); };
      for (let x = 24; x < m.W - 24; x += 80) ropeLine(x, 30, Math.min(x + 80, m.W - 24), 30);
      for (let y = 30; y < sea; y += 80) { ropeLine(24, y, 24, Math.min(y + 80, sea)); ropeLine(m.W - 24, y, m.W - 24, Math.min(y + 80, sea)); }
      g.lineWidth = 2.6; g.strokeStyle = INK;
      for (let x = 24; x <= m.W - 20; x += 80) rrect(g, x - 6, 16, 12, 30, 5, '#b88a5e');
      for (let y = 110; y < sea; y += 80) { rrect(g, 18, y - 14, 12, 26, 5, '#b88a5e'); rrect(g, m.W - 30, y - 14, 12, 26, 5, '#b88a5e'); }
      g.restore();
    },
    tree(c, v) { // cây dừa
      c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
      groundShadow(c, 18 * (v % 2 ? -1 : 1), 2, 50, 14);
      const lean = (v % 2 ? -1 : 1) * (14 + v * 4), h = 104 + (v > 1 ? 14 : 0);
      const tx = lean, ty = -h;
      const qb = t0 => [2 * (1 - t0) * t0 * 0 + t0 * t0 * tx, (1 - t0) * (1 - t0) * -2 + 2 * (1 - t0) * t0 * (-h * .5) + t0 * t0 * ty];
      c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(0, -h * .5, tx, ty);
      c.lineWidth = 19; c.strokeStyle = INK; c.stroke();
      c.lineWidth = 14; c.strokeStyle = '#d7a86e'; c.stroke();
      c.lineWidth = 2.2; c.strokeStyle = '#a8763f';
      for (let i = 1; i < 8; i++) { const [x, y] = qb(i / 8); c.beginPath(); c.moveTo(x - 6, y + 2); c.quadraticCurveTo(x, y - 2, x + 6, y + 2); c.stroke(); }
      c.lineWidth = 2.6; c.strokeStyle = INK;
      const leaf = (a, len) => {
        c.save(); c.translate(tx, ty); c.rotate(a);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .5, -18, len, 6); c.quadraticCurveTo(len * .5, 4, 0, 0);
        c.fillStyle = '#5fc27a'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(4, -1); c.quadraticCurveTo(len * .5, -8, len - 6, 4); c.strokeStyle = '#3e9a5c'; c.lineWidth = 2; c.stroke();
        c.restore();
      };
      for (const [a, len] of [[Math.PI + .5, 54], [Math.PI - .1, 58], [-.1, 58], [.5, 54], [Math.PI * 1.35, 46], [-Math.PI * .35, 46]]) leaf(a, len);
      c.strokeStyle = INK; c.lineWidth = 2.4;
      for (const [ox, oy] of [[-6, 6], [6, 7], [0, 12]]) circ(c, tx + ox, ty + oy, 6, '#8a5a44');
    },
    bush(c, v) {
      c.lineWidth = 2.4; c.lineJoin = 'round'; c.strokeStyle = INK;
      groundShadow(c, 4, 8, 34, 10);
      cloud(c, [[-16, -2, 16], [14, -2, 17], [0, -14, 19], [0, 2, 17]], ['#62c483', '#74cc6a', '#58bf96', '#86d06a'][v]);
      const fc = ['#ff6b8b', '#ff9fc4', '#ffd36e', '#ff9f43'][v];
      for (const [fx, fy] of [[-12, -8], [12, -12], [4, 2]]) {
        for (let k = 0; k < 5; k++) { const a = k * TAU / 5; dot(c, fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 3.4, fc); }
        dot(c, fx, fy, 2, '#fff3a0');
      }
    },
  };

  const THEMES = { farm, snow, beach };

  // ---------- sprite cây/bụi ----------
  const sprites = new Map();
  function sprite(theme, type, v) {
    const key = theme + type + v;
    let s = sprites.get(key);
    if (s) return s;
    const [w, h, ox, oy] = type === 'tree' ? [170, 200, 85, 175] : [96, 72, 48, 50];
    const c = document.createElement('canvas'); c.width = w * SS; c.height = h * SS;
    const g = c.getContext('2d'); g.scale(SS, SS); g.translate(ox, oy);
    THEMES[theme][type](g, v);
    s = { c, w, h, ox, oy };
    sprites.set(key, s);
    return s;
  }

  function build(m) {
    const T = THEMES[m.theme] || farm;
    const world = document.createElement('canvas');
    world.width = m.W; world.height = m.H;
    const g = world.getContext('2d');
    T.bg(g, m, mulberry(m.seed));
    const mw = 200, mh = Math.round(mw * m.H / m.W);
    const mini = document.createElement('canvas'); mini.width = mw * 2; mini.height = mh * 2;
    const mg = mini.getContext('2d'); mg.drawImage(world, 0, 0, mw * 2, mh * 2);
    const sc = mw * 2 / m.W; mg.fillStyle = T.mini;
    for (const [x, y] of m.trees) { mg.beginPath(); mg.arc(x * sc, y * sc, 5, 0, TAU); mg.fill(); }
    return { world, mini, mw, mh, fp: T.fp };
  }

  return { build, sprite, NAMES: { farm: 'Nông trại', snow: 'Làng tuyết', beach: 'Bãi biển' } };
})();
