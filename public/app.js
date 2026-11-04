// Popo app: routes between screens (Open, Lobby) and the running game, driven by server messages.
import { engine } from './core3d/engine.js';
import { net } from './core3d/net.js';
import * as ui from './core3d/ui.js';
import { sfx } from './core3d/sfx.js';
import * as assets from './core3d/assets.js';
import * as Open from './core3d/screens/open.js';
import * as Lobby from './core3d/screens/lobby.js';
import * as HideSeek from './games/hideseek3d/client.js';

const GAMES = { hideseek: HideSeek };
let screen = null, screenName = '', game = null, gameId = null, routing = Promise.resolve();

const app = {
  lobby: null,
  get myId() { return net.myId; },
  me() { return app.lobby && app.lobby.players.find(p => p.id === net.myId); },
  colorOf(id) { const i = app.lobby ? app.lobby.players.findIndex(p => p.id === id) : -1; return ui.PCOL[(i < 0 ? 0 : i) % ui.PCOL.length]; },
  leaveRoom() { net.leave(); unmountGame(); show('open', Open); },
  loaded() { document.getElementById('loading').classList.add('out'); },
};
const ctx = { engine, net, ui, sfx, assets, app };

function show(name, mod, arg) {
  routing = routing.then(async () => {
    if (screenName === name && screen) { screen.update && screen.update(app.lobby); return; }
    if (screen) { screen.leave(); screen = null; }
    screenName = name;
    screen = await mod.enter(ctx, arg);
    app.loaded();
  }).catch(e => { console.error(e); fatal(); });
}
async function mountGame(id) {
  if (gameId === id && game) return;
  if (screen) { screen.leave(); screen = null; screenName = ''; }
  game = GAMES[id]; gameId = id;
  await game.mount(ctx);
  app.loaded();
}
function unmountGame() { if (game) { game.unmount(); game = null; gameId = null; } }

function fatal() {
  ui.modal({ title: 'Oops', body: "Couldn't load the game files. Check your connection and reload.", actions: [{ label: 'Reload', cls: 'sun', onClick: () => location.reload() }], onClose: false });
}

net.on('lobby', m => {
  app.lobby = m;
  if (m.state === 'playing' && GAMES[m.game]) {
    routing = routing.then(() => mountGame(m.game)).then(() => game && game.onLobby && game.onLobby(m)).catch(e => { console.error(e); fatal(); });
  } else {
    routing = routing.then(() => unmountGame());
    show('lobby', Lobby);
  }
});
net.on('g', m => { if (game) game.onMsg(m.d); });
net.on('emote', m => { const t = game || screen; t && t.onEmote && t.onEmote(m.id, m.e); });
net.on('err', m => { const t = screen || game; if (t && t.onError) t.onError(m.msg); else ui.toast(m.msg, '#ffd0d4'); });
const reconn = document.getElementById('reconn');
net.on('reconnecting', d => { reconn.classList.add('on'); document.getElementById('reconnTxt').textContent = d.left ? `Holding your seat for ${d.left}s` : ''; });
net.on('reconnected', () => reconn.classList.remove('on'));
net.on('lost', d => { reconn.classList.remove('on'); unmountGame(); app.lobby = null; show('open', Open); ui.toast(d.reason, '#ffd0d4', 3500); });
net.on('disconnected', d => { if (screen && screen.onDisconnected) screen.onDisconnected(d); });

// Each frame: keep 3D labels glued to their objects.
engine.onFrame(() => ui.updateTags(engine.camera));

// Start: rejoin the room this tab was in, otherwise the Open screen.
if (net.session) { net.resume(); setTimeout(() => { if (!app.lobby && !screen) show('open', Open); }, 8000); }
else { net.connect(); show('open', Open); }
window.__popo = { app, net, engine }; // handy for debugging in the console
