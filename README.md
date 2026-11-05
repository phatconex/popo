# Pawty

Tiny 3D party games for friends & couples — play together from anywhere, on desktop or phone.
Built with three.js (no build step) and a small Node + WebSocket server.

## Run
```bash
npm install
npm start
```
Open http://localhost:3000. Friends on the same Wi-Fi can join with the IP address the server prints.

Tests: `npm test` (rules, maps, rooms). Full bot match over the network:
```bash
HS_HIDE_T=2 HS_ROUND_T=20 PORT=3100 node server/index.js &
node test/bot-match.js 3100
```
Bots that join your room and play: `node test/bot-match.js --join ABCD 3000 3` (or `--lobby ABCD 3000 11` to fill a lobby).

## Deploy
Pawty needs a **long-running Node server** for WebSockets — Vercel / Netlify / GitHub Pages only serve static files.

**Render** (free tier): New → Blueprint → pick this repo (it reads `render.yaml`) → Apply. Share the `https://popo-xxxx.onrender.com` link.
The free tier sleeps after ~15 min idle; the first visit takes 30–50 s to wake up (the page keeps retrying).
Railway, Fly.io or any VPS work too: start command `npm start`, port from `PORT`.

Static site somewhere else? Point it at your game server in `public/config.js`:
```js
window.POPO_SERVER = 'https://popo-xxxx.onrender.com';
```

## Hide & Seek (2–12 players)
- **Hiders** look exactly like the herd animals. Walk slowly, stay with the herd, hide behind trees and bushes.
  Running is fast but leaves footprints.
  Tricks: **Swap** your animal, **Call** (−3 s on the clock), **Sleep** (a shot counts as a miss), **Decoy** (release a look-alike that runs off).
- **Seeker** has a water gun. Squirting a real animal costs 15 water; empty tank = out. **Listen** tells you whether a hider is close.
- **Frenzy** — the last 5 seconds: the seeker is faster, misses are free and you can hold to keep squirting.
- Everyone takes a turn as the seeker; points add up over the rounds, then a podium.
- 3 maps with their own animals: **Farm** (Piggy, Cow, Chick, Bunny, Puppy, Kitty), **Snow Village** (Penguin, Polar Bear, Fox, Deer, Beaver),
  **Beach** (Crab, Parrot, Monkey, Koala, Tiger).
- Controls — desktop: WASD/arrows, Shift run, E swap, Q call, Z sleep, F decoy; seeker: mouse to aim, click to squirt, R listen.
  Phone: joystick on the left, buttons on the right; seekers tap the ground to squirt.
- Quick test timings: `HS_HIDE_T=5 HS_ROUND_T=45 npm start`.

## Blind Drive (2–8 players, teams)
- Pick a team in the lobby (Red, Blue, Green, Yellow; 2–3 per team, leftovers are placed automatically).
- In each team one player **drives blind** — they only see their own car in thick fog — and the others **call the turns** while seeing the whole road.
- All teams race the same road at once as ghost cars. Pick up passengers at the pink rings (stop inside for a moment), grab coins, mind slippery puddles,
  animals crossing and hills. Hitting an animal or leaving the road spins you out for 2 s.
- Points per level: finish place 300 / 200 / 120 / 60, +100 per passenger, +10 per coin. Roles rotate every level; podium at the end.
- Maps: Country Road, Snowy Pass, Beach Town, Night City. Settings: levels (2/4/6) and signal delay.
- Controls — driver: A/D or arrows to steer, W gas, S brake, R reverse (buttons on phones).
  Navigator: A left, D right, W straight, E faster, Q slow, S stop, R reverse, Space pick up (buttons on phones).
- Quick test: `BD_FAST=1 PORT=3101 node server/index.js` then `node test/bot-match.js --drive 3101 4`.

## The app
- Open screen → Play (new room) or Join Room (4-letter code or `?room=ABCD` invite link).
- 3D lobby with up to 12 players: pick one of 24 animals, Ready, host picks the game and its settings, Start.
- Dropped connection (switching apps, reload, bad signal): your seat is kept for 30 s and you rejoin the same round.
- 8 emotes for everyone in the room.

Critter Badminton is paused while it moves to 3D (its code stays in `server/games/badminton` and `public/games/badminton`).

## Layout
```
server/index.js               static files + WebSocket, game registry
server/core.js                rooms, rejoin, ready flag, emotes, settings
server/games/hideseek/        rules (index.js) + map generator (maps.js)
server/games/blinddrive/      race rules (index.js) + track generator (track.js)
public/index.html, app.js     page shell + screen router
public/core3d/                engine, asset loader, network, UI kit, sound, animals table (shared with the server)
public/core3d/screens/        Open and Lobby screens
public/games/hideseek3d/      world builder, entities, HUD, effects, overlays
public/games/blinddrive3d/    shared physics (shared.js, also used by the server), world, car, HUD, overlays
public/assets/kenney/         3D models (Kenney, CC0) + licenses
test/                         node:test unit tests + bot match script
docs/superpowers/             design spec and implementation plan
```

## Credits
- 3D models: [Kenney](https://kenney.nl) — Cube Pets, Nature Kit, Platformer Kit, Fantasy Town Kit, Holiday Kit, Pirate Kit, Survival Kit (CC0). License files are next to the models.
- Font: [Lilita One](https://fonts.google.com/specimen/Lilita+One) (SIL Open Font License).
- three.js (MIT).
