// Cầu Lông Thú — vật lý quả cầu, dùng chung cho server (require) và trình duyệt (window.BMPhys).
// Đường bay là công thức kín (trọng lực + gió), nên cùng một cú đánh thì mọi máy tính ra cùng một đường.
// Toạ độ: x từ 0 đến W (lưới ở giữa), y tính từ mặt sân hướng lên.
(function (root) {
  const W = 1200, NET_X = 600, NET_H = 150, G = 980;
  const COURT = [40, 1160];                 // vạch biên hai đầu sân
  const ANIMALS = [
    { kind: 5, name: 'Thỏ', tag: 'Nhảy cao', speed: 1, jump: 1.3, reach: 1, power: 1 },
    { kind: 0, name: 'Heo', tag: 'Đập mạnh, chạy chậm', speed: .85, jump: .95, reach: 1, power: 1.3 },
    { kind: 6, name: 'Cánh cụt', tag: 'Chạy nhanh', speed: 1.25, jump: 1, reach: 1, power: 1 },
    { kind: 9, name: 'Cáo tuyết', tag: 'Tầm vợt rộng', speed: 1, jump: 1, reach: 1.35, power: 1 },
  ];
  const BASE = { speed: 340, jump: 600, reach: 62, grav: 1500 };
  // kiểu đánh: khoảng cách điểm rơi tính từ lưới, thời gian bay
  const SHOTS = {
    serve: { dist: 330, T: 1.45 },
    hit: { dist: 380, T: 1.2 },
    lob: { dist: 510, T: 1.75 },
    drop: { dist: 95, T: 1.05 },
    smash: { dist: 300, T: .5 },
  };

  function quadRoot(a, b, c) { // nghiệm dương nhỏ nhất của a t² + b t + c = 0
    if (Math.abs(a) < 1e-9) { if (Math.abs(b) < 1e-9) return Infinity; const t = -c / b; return t > 1e-6 ? t : Infinity; }
    const d = b * b - 4 * a * c; if (d < 0) return Infinity;
    const s = Math.sqrt(d), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
    const r = [t1, t2].filter(t => t > 1e-6).sort((p, q) => p - q);
    return r.length ? r[0] : Infinity;
  }

  // tạo đường bay từ điểm đánh: tính sẵn lúc qua lưới, có mắc lưới không, lúc chạm đất và điểm rơi
  function make(x, y, vx, vy, ax) {
    ax = ax || 0;
    const tr = { x, y, vx, vy, ax };
    const tLand0 = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, y))) / G;
    const tNet = quadRoot(ax / 2, vx, x - NET_X);
    tr.netHit = false;
    if (tNet < tLand0) {
      const yN = y + vy * tNet - G * tNet * tNet / 2;
      if (yN < NET_H) { tr.netHit = true; tr.tNet = tNet; tr.yNet = Math.max(0, yN); }
    }
    if (tr.netHit) {
      tr.tLand = tr.tNet + Math.sqrt(2 * tr.yNet / G);
      tr.xLand = NET_X - Math.sign(vx + ax * tr.tNet || 1) * 10;
    } else {
      tr.tLand = tLand0;
      tr.xLand = x + vx * tLand0 + ax * tLand0 * tLand0 / 2;
    }
    return tr;
  }

  // vị trí + hướng bay tại thời điểm t (giây kể từ lúc đánh)
  function pos(tr, t) {
    t = Math.max(0, Math.min(t, tr.tLand));
    if (tr.netHit && t > tr.tNet) {
      const d = t - tr.tNet;
      return { x: tr.xLand, y: Math.max(0, tr.yNet - G * d * d / 2), vx: 0, vy: -G * d };
    }
    return { x: tr.x + tr.vx * t + tr.ax * t * t / 2, y: Math.max(0, tr.y + tr.vy * t - G * t * t / 2), vx: tr.vx + tr.ax * t, vy: tr.vy - G * t };
  }

  // tính cú đánh: dir = +1 đánh sang phải, -1 sang trái. Gió KHÔNG được tính vào ngắm nên cầu sẽ bị gió đẩy lệch.
  function aim(kind, x, y, dir, animal, fire, wind) {
    if (kind === 'smash' && y < 165) kind = 'hit';
    const s = SHOTS[kind] || SHOTS.hit, an = ANIMALS[animal] || ANIMALS[0];
    // đứng càng sâu cuối sân thì đánh càng sâu một chút, để các cú đánh không giống hệt nhau
    const depth = Math.abs(x - NET_X) / NET_X;
    const tx = NET_X + dir * (s.dist + (kind === 'drop' ? depth * 30 : (depth - .5) * 120));
    let T = s.T;
    if (kind === 'smash' || kind === 'hit') T /= an.power;
    if (fire) T *= .6;
    let vx, vy;
    for (let i = 0; i < 14; i++) {
      vx = (tx - x) / T; vy = (G * T * T / 2 - y) / T;
      const tn = (NET_X - x) / vx;
      if (!(tn > 0) || y + vy * tn - G * tn * tn / 2 > NET_H + 22) break;
      T += .08;
    }
    return make(x, y, vx, vy, wind || 0);
  }

  const api = { W, NET_X, NET_H, G, COURT, ANIMALS, BASE, SHOTS, make, pos, aim };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BMPhys = api;
})(typeof window !== 'undefined' ? window : this);
