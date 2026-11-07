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
  Tricks: **Call** (−3 s on the clock, but every seeker gets an arrow toward where you called for 3 s), **Decoy** (release a look-alike that runs off).
- **Seeker** has a water gun. Squirting a real animal costs 15 water; empty tank = out. **Listen** sends out a wave: it turns **red** if a hider is within
  6.5 m (two red waves = very close), blue if nobody is. Only the seeker sees the colour.
- **Frenzy** — the last 5 seconds: the seeker is faster, misses are free and you can hold to keep squirting.
- Everyone takes a turn as the seeker; points add up over the rounds, then a podium.
- 3 maps with their own animals: **Farm** (Piggy, Cow, Chick, Bunny, Puppy, Kitty), **Snow Village** (Penguin, Polar Bear, Fox, Deer, Beaver),
  **Beach** (Crab, Parrot, Monkey, Koala, Tiger).
- Controls — desktop: WASD/arrows, Shift run, Q call, F decoy; seeker: mouse to aim, click to squirt, R listen.
  Phone: joystick on the left, buttons on the right; seekers tap the ground to squirt.
- Settings: map, rounds, and round time (2 / 3 / 4 / 5 min).
- Quick test timings: `HS_HIDE_T=5 HS_ROUND_T=45 npm start` (`HS_ROUND_T` overrides the Time setting).

## Bonk Island (2–12 players)
- Shove everyone else into the sea. Last paw standing wins the round. The island is a hex grid whose outer tiles flash red, sink and fall away, shrinking it to one tile.
- Moves: **Push** (quick shove), **Bonk** (hold to charge, release to lunge and wallop; a Bonk that misses lunges all the way and can carry you into the sea), **Dash**.
  Knocked into the sea? You become a ghost on a cloud and drop **coconuts** on the island (they knock people away from the impact).
- Points per round: 1st 5, 2nd 3, 3rd 2, 4th 1, plus 1 for every knock-out (the last hit within 4 s counts, coconut knock-outs included). Highest total after the rounds wins, then a podium.
- Settings: map (default **Random**, which cycles Beach, Snow and Farm; or **Beach**, **Snow** with slippery **ice** tiles, **Farm** with slow, sticky **mud** tiles) and rounds (3 / 5 / 7, default 5).
- Controls — desktop: WASD/arrows, J push, hold K then release to bonk, Space (or L) dash; ghost: J or Space drops a coconut.
  Phone: joystick on the left, blue Push, red Bonk (hold), green Dash, brown Coconut on the right.
- Quick test timings: `BK_FAST=1 npm start` (shorter countdowns and breaks). `NET_LAG_MS=250` delays every message by 125 ms each way (a 250 ms round trip) to feel a slow connection.
- Bots: `node test/bot-match.js --bonk PORT N` runs a full bot match (2–6 bots; start the server with `BK_FAST=1` for short rounds);
  `node test/bot-match.js --bonk-join CODE PORT N` adds bots to your room so you can play against them.

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
server/games/bonk/            Bonk Island rules (index.js) + island/map generator
public/index.html, app.js     page shell + screen router
public/core3d/                engine, asset loader, network, UI kit, sound, animals table (shared with the server)
public/core3d/screens/        Open and Lobby screens
public/games/hideseek3d/      world builder, entities, HUD, effects, overlays
public/games/bonk3d/          Bonk Island shared physics, world, HUD, overlays
public/core3d/podium.js       podium shared by both games
public/assets/kenney/         3D models (Kenney, CC0) + licenses
test/                         node:test unit tests + bot match script
docs/superpowers/             design spec and implementation plan
```

## Credits
- 3D models: [Kenney](https://kenney.nl) — Cube Pets, Nature Kit, Platformer Kit, Fantasy Town Kit, Holiday Kit, Pirate Kit, Survival Kit (CC0). License files are next to the models.
- Font: [Lilita One](https://fonts.google.com/specimen/Lilita+One) (SIL Open Font License).
- three.js (MIT).
