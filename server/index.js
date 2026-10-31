// Góc Rảnh — server: phục vụ file tĩnh + WebSocket cho mọi game.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Core = require('./core');

// Thêm game mới: tạo thư mục server/games/<id> rồi đăng ký ở đây.
const GAMES = {
  hideseek: require('./games/hideseek'),
};

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (u.endsWith('/')) u += 'index.html';
  const file = path.normalize(path.join(PUBLIC, u));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const core = new Core(GAMES);
new WebSocketServer({ server }).on('connection', ws => core.connect(ws));

server.listen(PORT, () => {
  console.log(`Goc Ranh dang chay: http://localhost:${PORT}`);
  for (const ifs of Object.values(os.networkInterfaces()))
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) console.log(`   Ban be cung wifi vao: http://${i.address}:${PORT}`);
});
