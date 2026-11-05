// WebSocket connection to the Pawty server: join/leave, automatic reconnect + rejoin with the room token.
// Events: 'welcome', 'joined', 'lobby', 'emote', 'g' (game message), 'err', 'reconnecting', 'reconnected', 'lost', 'disconnected'.
const SERVER_URL = (() => {
  const s = String(window.POPO_SERVER || '').trim().replace(/\/+$/, '');
  if (s) return s.replace(/^http/, 'ws');
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
})();
const SESS_KEY = 'popo.sess';
const readSess = () => { try { return JSON.parse(sessionStorage.getItem(SESS_KEY)); } catch { return null; } };
const writeSess = v => { try { v ? sessionStorage.setItem(SESS_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SESS_KEY); } catch {} };

const listeners = {};
let ws = null, retryTimer = null, retryUntil = 0, idleRetry = null;

export const net = {
  myId: 0,
  session: readSess(),
  games: [],
  on(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); return () => listeners[type].delete(fn); },
  emit(type, d) { for (const fn of listeners[type] || []) fn(d); },
  send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); },
  game(d) { net.send({ t: 'g', d }); },
  connect(onOpen) {
    if (ws && ws.readyState === 1) return onOpen && onOpen();
    if (ws && ws.readyState === 0) { if (onOpen) ws.addEventListener('open', onOpen, { once: true }); return; }
    const sock = ws = new WebSocket(SERVER_URL);
    sock.onopen = () => { sock.opened = true; clearTimeout(idleRetry); onOpen && onOpen(); };
    sock.onmessage = e => onMsg(JSON.parse(e.data));
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (net.session) return startRetry();
      net.emit('disconnected', { opened: !!sock.opened });
      clearTimeout(idleRetry);
      idleRetry = setTimeout(() => { if (!ws && !net.session) net.connect(); }, 3000); // free servers can take ~30 s to wake up
    };
  },
  join({ name, av, code, game }) { net.connect(() => net.send({ t: 'join', name, av, code, game })); },
  leave() { net.send({ t: 'leave' }); net.session = null; writeSess(null); },
  resume() { if (net.session) startRetry(true); else net.connect(); },
};

function onMsg(m) {
  switch (m.t) {
    case 'welcome': net.games = m.games; break;
    case 'joined':
      net.myId = m.id; net.session = { code: m.code, token: m.token }; writeSess(net.session);
      if (retryTimer) { stopRetry(); net.emit('reconnected'); }
      break;
    case 'rejoin_fail':
      stopRetry(); net.session = null; writeSess(null); net.emit('lost', { reason: 'The room was closed or your seat timed out.' });
      return;
  }
  net.emit(m.t, m);
}

function startRetry(first) {
  if (retryTimer) return;
  retryUntil = Date.now() + 35000;
  net.emit('reconnecting', { first: !!first, left: 35 });
  const tryOnce = () => {
    if (!net.session) return stopRetry();
    if (Date.now() > retryUntil) { stopRetry(); net.session = null; writeSess(null); net.emit('lost', { reason: "Couldn't reconnect. Start a new room!" }); return; }
    net.emit('reconnecting', { left: Math.ceil((retryUntil - Date.now()) / 1000) });
    if (!ws) net.connect(() => net.send({ t: 'rejoin', code: net.session.code, token: net.session.token }));
  };
  tryOnce();
  retryTimer = setInterval(tryOnce, 1500);
}
function stopRetry() { clearInterval(retryTimer); retryTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && net.session && (!ws || ws.readyState > 1)) startRetry(); });
