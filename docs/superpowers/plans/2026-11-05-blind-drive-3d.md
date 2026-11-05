# Blind Drive 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Blind Drive to Pawty as a 3D team race (2–8 players, teams of 2–3, one blind driver + navigators per team) using the existing app shell.

**Architecture:** A new server game module `blinddrive` (phases, teams, race rules, scoring) plus a UMD file shared by server and browser (`shared.js`: RNG, terrain height, car physics, crossers, track lookup, scenery layout). Each driver's browser simulates its own car with `stepCar` and reports its pose; the server validates the pose and applies all race rules. The browser game `blinddrive3d` follows the Hide & Seek client pattern (`mount/unmount/onMsg/onEmote`, world + HUD + overlays).

**Tech Stack:** Node + `ws`, `node:test`; three.js 0.160.0 via importmap (no build step); Kenney GLB packs already in `public/assets/kenney/`.

**Spec:** `docs/superpowers/specs/2026-11-05-blind-drive-3d-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- All visible text in English, font Lilita One, **no emoji anywhere** (UI, code comments shown to users, commit messages).
- No build step: the server still starts with `npm start`; browser code is plain ES modules loaded via the existing importmap (three@0.160.0).
- Only Kenney packs already in `public/assets/kenney/` (nature, platformer, holiday, pirate, survival, town, pets). Do not download anything.
- Units in this game are metres (1 m = 1 three.js unit). Heading `a` in radians, forward vector `(sin a, cos a)` in `(x, z)`; right vector of a tangent `(tx, tz)` is `(-tz, tx)`.
- Hide & Seek behaviour must not change; its tests and `test/bot-match.js` full match must still pass.
- Tests use `node:test`; run all with `npm test` (`node --test test/*.test.js`).
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push; do not touch `render.yaml`.

## Review Focus

1. **Driver tab hidden or frozen** (phone locks, tab in background): no `car` messages arrive. Expected: after 1 s without a message the server treats the car as stopped (`v = 0`) so others see it stop, and nothing crashes. Test in Task 5.
2. **Garbage from clients** (`car` with `NaN`, strings, `Infinity`; `sig` with `k = 9`, `-1`, `'2'`; `car` from a navigator): ignored, game keeps running. Tests in Task 4 (`validateMove`) and Task 5.
3. **Driver rejoins after being replaced**: they come back as a navigator for the rest of the level and the replacement keeps driving. Test in Task 5.
4. **Two teams cross the finish in the same tick**: places are distinct and deterministic (the car further past the line gets the better place; still equal → lower team id). Test in Task 5.
5. **Host switches game in the lobby after people picked teams, or a 9th person is present at Start**: teams are cleared on game switch; Start with more than `meta.max` connected players is refused with `Max 8 players for this game`. Tests in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `public/games/blinddrive3d/shared.js` (new, UMD) | `rng`, `heightAt`, `slopeAlong`, `CAR`, `stepCar`, `envAt`, `crosserPos`, `nearestOnTrack`, `stopPoints`, `layout`, `THEMES` (crossers/riders/hill ranges per map). `window.BD` in the browser, `require` on the server. |
| `server/games/blinddrive/track.js` (new) | `genTrack(theme, level, seed, opts)` → track data. |
| `server/games/blinddrive/index.js` (new) | Game module: `meta`, phases, teams, race tick, scoring, disconnects; `_test` exports. |
| `server/core.js` (modify) | Team field in lobby, `profile.team`, clear teams on game switch, `meta.max` at Start. |
| `server/index.js` (modify) | Register `blinddrive`; remove paused-drive note. |
| `public/core3d/screens/lobby.js` (modify) | Team columns when `meta.teams`. |
| `public/core3d/assets.js` (modify) | `metalness = 0` on load. |
| `public/app.js` (modify) | Register `blinddrive` client. |
| `public/index.html` (modify) | Load `games/blinddrive3d/shared.js` as a classic script before `app.js`. |
| `public/games/blinddrive3d/client.js` | Mount/unmount, message handling, frame loop, local car sim, cameras. |
| `public/games/blinddrive3d/world.js` | Terrain, road, game objects, scenery from `layout`. |
| `public/games/blinddrive3d/car.js` | Team-coloured car with driver/passenger pets. |
| `public/games/blinddrive3d/hud.js`, `hud.css` | Navigator and driver HUDs, controls. |
| `public/games/blinddrive3d/overlays.js` | Get Ready, countdown, finish banner, level results, podium. |
| `public/games/blinddrive3d/ambient.js` | Butterflies / snow / sea sparkles / fireflies. |
| `test/blinddrive.test.js` (new) | shared + track + game module tests. |
| `test/core.test.js` (modify) | team/lobby tests. |
| `test/bot-match.js` (modify) | `--drive` mode. |
| Delete | `server/games/drive/`, `public/games/drive/`. |

---

### Task 1: Shared math and car physics (`shared.js`)

**Files:**
- Create: `public/games/blinddrive3d/shared.js`
- Test: `test/blinddrive.test.js`

**Interfaces:**
- Produces (all on the exported object `BD`):
  - `rng(seed: number) → () => number` in `[0,1)` (mulberry32).
  - `heightAt(hills: Hill[], x, z) → number`, where `Hill = {x, z, h, s}` and height = Σ `h·exp(-((x-hx)²+(z-hz)²)/(2s²))`.
  - `slopeAlong(hills, x, z, a) → number` = `(heightAt(p+0.8·fwd) - heightAt(p-0.8·fwd)) / 1.6`.
  - `CAR = {VMAX: 7, VMAX_OFF: 3.2, VREV: -2.5, ACC: 4.5, BRAKE: 10, DRAG: .45, DRAG_SLICK: .2, TURN: 2.2, TURN_V: 2.5, GRIP: 9, GRIP_SLICK: 1.2, GRIP_ICE: .7, SLOPE_G: 6}` (spec 2.6).
  - `stepCar(car: {x,z,a,v,lat}, inp: {steer,gas,brake,rev}, env: {slope, slick, ice, off}, dt) → void` (mutates `car`; `lat` is sideways slip speed decayed by grip).
  - `nearestOnTrack(track, x, z) → {i, dist, side, s}` (`i` nearest point index, `dist` metres from the centre line, `side` +1 right / −1 left, `s = i/(pts.length-1)`).
  - `envAt(track, x, z, a) → {slope, slick, ice, off, edge}`; `off` when `dist > track.rw`; `edge = dist - track.rw`; `slick` inside any slick ellipse; `ice = slick && track.theme === 'snow'`.
  - `crosserPos(track, c, t) → {x, z, dir, onRoad}` (spec 2.3; amplitude `track.rw + 2`, rest 1.5 s each side, period `4·amp/c.spd + 3`, phase `c.ph`).
  - `stopPoints(track, stop) → {ring:{x,z}, pet:{x,z}}`: ring at `side·(rw-0.4)`, pet/sign at `side·(rw+1.6)` from `pts[stop.i]`.
  - `THEMES` = per map `{crossers:[animal codes], riders:[animal codes], hills:[min,max,hMin,hMax]}` with values from spec 3.1/3.2 (codes from `public/core3d/animals.js`: country crossers `[3,0]` riders `[1,4,0,6,5]`; snow `[7,8]` / `[7,18,2,20]`; beach `[11,12]` / `[11,13,10,12]`; night `[5,6]` / `[6,5,9,15]`; hills country `[3,4,3,4.5]`, snow `[4,5,3.5,5]`, beach `[1,2,1.5,2.5]`, night `[0,1,1,2]`).

- [ ] **Step 1: Write the failing tests** in `test/blinddrive.test.js`:

```js
const BD = require('../public/games/blinddrive3d/shared.js');
const flat = { slope: 0, slick: 0, ice: 0, off: 0 };
const run = (env, inp, secs, v = 0) => { const c = { x: 0, z: 0, a: 0, v, lat: 0 }; for (let i = 0; i < secs * 60; i++) BD.stepCar(c, inp, env, 1 / 60); return c; };
test('rng is deterministic', () => { const a = BD.rng(42), b = BD.rng(42); assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]); });
test('heightAt sums gaussian hills', () => { const h = [{ x: 0, z: 0, h: 3, s: 10 }]; assert.strictEqual(BD.heightAt(h, 0, 0), 3); assert.ok(BD.heightAt(h, 30, 0) < .1); });
test('stepCar caps speed on road and grass', () => {
  assert.ok(Math.abs(run(flat, { gas: 1 }, 4).v - BD.CAR.VMAX) < .01);
  assert.ok(run({ ...flat, off: 1 }, { gas: 1 }, 4).v <= BD.CAR.VMAX_OFF + 1e-9);
});
test('stepCar: uphill slower, downhill faster, rolls back with no gas', () => {
  const up = run({ ...flat, slope: .2 }, { gas: 1 }, 2), dn = run({ ...flat, slope: -.2 }, {}, 2, 3), fl = run(flat, { gas: 1 }, 2);
  assert.ok(up.v < fl.v); assert.ok(dn.v > 3);
  assert.ok(run({ ...flat, slope: .2 }, {}, 3, 1).v < 0);
});
test('stepCar reverse is capped and deterministic', () => {
  const r = run(flat, { rev: 1 }, 4); assert.ok(r.v >= BD.CAR.VREV - 1e-9 && r.v < 0);
  assert.deepStrictEqual(run(flat, { gas: 1, steer: .5 }, 3), run(flat, { gas: 1, steer: .5 }, 3));
});
test('crosserPos crosses the road and rests on each side', () => { /* straight track along +z, rw 1.9; sample t over one period: some samples onRoad, |offset| reaches rw+2, and dir === 0 for >= 1.4 s on each side */ });
test('nearestOnTrack and envAt', () => { /* straight track: point 1 m right of pts[5] → i 5, dist≈1, side 1, off 0; 3 m → off 1, edge≈1.1 */ });
```

Fill the two commented tests with a straight track `{pts: [[0,0],[0,2],…,[0,40]], rw: 1.9, hills: [], slicks: [], theme: 'country'}` and the assertions described.

- [ ] **Step 2: Run** `node --test test/blinddrive.test.js` — expected FAIL (`Cannot find module`).
- [ ] **Step 3: Implement `shared.js`** as UMD exactly like `public/core3d/animals.js` (`module.exports = BD` on Node, `root.BD = BD` in the browser). `stepCar` order per step: apply gas/brake/reverse/drag to `v`, add `-SLOPE_G·slope·dt`, clamp to `[VREV, off ? VMAX_OFF : VMAX]`, turn `a += steer·TURN·min(1,|v|/TURN_V)·sign(v)·dt·(slick ? .6 : 1)`, decay `lat` toward 0 by grip, move along forward + right.
- [ ] **Step 4: Run** `npm test` — expected PASS (all old tests too).
- [ ] **Step 5: Commit** `feat(blinddrive): shared terrain, car physics and track helpers`.

### Task 2: Track generator (`track.js`)

**Files:**
- Create: `server/games/blinddrive/track.js`
- Test: `test/blinddrive.test.js`

**Interfaces:**
- Consumes: `BD.rng`, `BD.heightAt`, `BD.THEMES`.
- Produces: `genTrack(theme: 'country'|'snow'|'beach'|'night', level: 0-based int, seed: int, opts?: {len?: number}) → Track`:

```
Track = { seed, theme, level, rw, pts: [[x,z]...] (2 m apart, rounded to .01),
  hills: [{x,z,h,s}], stops: [{i, side, kind}], coins: [[x,z]...] (rows of 5 on the centre line, 1.4 m apart),
  slicks: [{x, z, rx, rz, a}], crossers: [{i, kind, ph, spd}], finishI }
```

Values (spec 3.1): length `opts.len ?? min(330, 180 + 30·level)` m; `rw = max(1.5, 1.9 - .08·level)`; first 12 m straight and flat, last 10 m straight; heading change per step limited so the direction stays within ±75° of the start direction; stops 3 (4 when `level >= 2`), coins 4 rows, slicks 2 (snow 4), crossers 2; game objects at least 14 m apart along the track, none in the first 12 m or last 10 m; `finishI = pts.length - 6`; hills count and heights from `THEMES[theme].hills`, centred on track points, `s` 8–11.5, no hill centre within 20 m of the start or finish.

- [ ] **Step 1: Failing tests**:
  - `genTrack: 200 seeds x 4 themes x levels 0-5` — no two non-adjacent segments intersect (segment intersection test), consecutive points 2 ± .01 m apart, `|slopeAlong| <= .22` at every point, total length within 2 m of the target.
  - `genTrack: objects spaced and placed` — every pair of stops/coin rows/slicks/crossers ≥ 14 m apart along the track; none before index 6 or after `finishI - 5`; counts as specified; `rw` matches the formula.
  - `genTrack: same seed gives same track` — `deepStrictEqual`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** using `BD.rng(seed)`; if a generated track breaks the slope limit, scale every hill's `h` down by 10% and recheck until it passes.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat(blinddrive): random track generator`.

### Task 3: Teams in the core and lobby

**Files:**
- Modify: `server/core.js` (`lobbyMsg`, `profile`, `settings`, `start`)
- Modify: `public/core3d/screens/lobby.js`
- Test: `test/core.test.js`

**Interfaces:**
- Produces: lobby players carry `team` (−1 none, 0–3); client sends `{t:'profile', team}`; game modules read `p.team` from `api.players()`.

- [ ] **Step 1: Failing tests** in `test/core.test.js` with a fake team game `{meta:{id:'tg', min:2, max:8, teams:{count:4, max:3, names:['Red','Blue','Green','Yellow']}, settings:[]}}` registered next to `fakeGame`:
  - `core: teams` — players start with `team: -1`; `profile {team: 2}` sets 2; a 4th person joining team 2 is refused (stays −1); `team: -1` leaves; `team: 7` ignored.
  - `core: profile.team is ignored for games without teams` (`fake` game keeps −1).
  - `core: switching game clears teams` — host sends `settings {game:'fake'}` then back; all `team === -1`.
  - `core: meta.max at start` — 9 connected players in a `tg` room: `start` returns `{t:'err', msg:'Max 8 players for this game'}` and no game starts.
  - `core: teams survive the end of a game` — start `tg` with 2 players in team 1, call `lastApi.end([])`; lobby shows `state: 'lobby'` and both still `team === 1`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `core.js`: `np.team = -1` on join; `lobbyMsg` adds `team: p.team`; `profile` handles `m.team` only when `this.games[r.gameId].meta.teams` exists and the target team has fewer than `teams.max` members; `settings` resets every `p.team = -1` when the game changes; `start` checks `n > g.meta.max`.
- [ ] **Step 4: Lobby UI** in `lobby.js`: when the selected game's meta has `teams`, render 4 columns (name, colour from spec 2.1, up to 3 member chips with name + animal thumb, a `Join` / `Leave` button sending `profile {team}`), and tint each pedestal by team colour (grey when −1). Unchanged for games without `teams`. Check in the browser with two tabs on Hide & Seek (no columns) and on Blind Drive after Task 5 registers it (columns).
- [ ] **Step 5: Run** `npm test` — PASS. **Commit** `feat(core): team picking in the lobby, meta.max at start`.

### Task 4: Game module pure rules (`balance`, `score`, `rank`, `validateMove`)

**Files:**
- Create: `server/games/blinddrive/index.js` (pure functions + `meta` only in this task)
- Test: `test/blinddrive.test.js`

**Interfaces:**
- Produces (`module.exports = { meta, create, _test: { balance, score, rank, validateMove, PLACE_PTS } }`):
  - `meta` exactly per spec 4.3 (`id 'blinddrive'`, `name 'Blind Drive'`, `desc 'One drives blind, one calls the turns'`, `tag '2-8 players · teams'`, `min 2`, `max 8`, `teams {count:4, max:3, names}`, settings `map` (`random`, `country` 'Country Road', `snow` 'Snowy Pass', `beach` 'Beach Town', `night` 'Night City'), `levels` (2/4/6, def 4), `delay` (0 'None', .5 '0.5 s', 1 '1 s', def 0)).
  - `balance(players: [{id, team}] in join order, count = 4, max = 3) → number[][]` (length `count`, member ids in join order).
  - `PLACE_PTS = [300, 200, 120, 60]`; `score({place, picked, coins}) → number` (`place` 1-based or `null`).
  - `rank(rows: [{team, total, firsts}]) → [{team, total, firsts, rank}]` sorted best first; equal `total` and `firsts` share `rank`.
  - `validateMove(prev: {x, z, t} | null, next: any, now: number) → boolean`.

`balance` algorithm (spec 2.1): (1) seed groups from `team` (overflow beyond `max` and invalid teams become unassigned); (2) place each unassigned player: a group of size 1 first, else an empty group if at least 2 unassigned remain, else the smallest non-full non-empty group; (3) fix singles: merge singles pairwise (later into earlier), then move a remaining single into the lowest-index group of size 2; if none has room, move the last-joined member of a size-3 group into the single's group. Result: every non-empty group has 2–3 members.

- [ ] **Step 1: Failing tests**:
  - `balance` cases: 2 players both unpicked → one group of 2; 2 players in teams 0 and 3 → one group of 2; 3 unpicked → one group of 3; 5 players picked `[0,0,1,1,-1]` → sizes `[3,2]` or `[2,3]` with no group of 1; 7 players `[0,1,1,1,2,2,2]` → all non-empty groups 2–3; 8 unpicked → four groups of 2; property test: random picks for n = 2..8 (500 runs) → every non-empty group size in [2,3] and every id appears exactly once.
  - `score`: `{place:1, picked:2, coins:3}` → 530; `{place:null, picked:1, coins:0}` → 100; `{place:4,…0}` → 60; `{place:5,…}` → 0.
  - `rank`: `[{team:0,total:500,firsts:1},{team:1,total:500,firsts:2},{team:2,total:500,firsts:2}]` → team 1 and 2 rank 1, team 0 rank 3.
  - `validateMove`: accepts a 0.3 m move after 0.05 s; rejects 3 m after 0.05 s; rejects `x: NaN`, `x: 'a'`, `z: Infinity`, missing fields; accepts anything finite when `prev` is null.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Move limit: `CAR.VMAX · max(.05, now - prev.t) · 1.5 + .5`.
- [ ] **Step 4: Run** `npm test` — PASS. **Commit** `feat(blinddrive): team balancing, scoring and move validation`.

### Task 5: Game module flow (phases, race, disconnects) + registration

**Files:**
- Modify: `server/games/blinddrive/index.js`
- Modify: `server/index.js` (`GAMES = { hideseek, blinddrive }`, remove the "paused" comment for drive)
- Delete: `server/games/drive/`, `public/games/drive/`
- Test: `test/blinddrive.test.js`

**Interfaces:**
- Consumes: Task 1 `BD.*`, Task 2 `genTrack`, Task 4 helpers, core `api` (`settings`, `players()`, `send`, `bcast`, `end`).
- Produces: the messages in spec 4.5 plus `roles: {teams:[{id, driver}]}` (sent whenever a driver changes). Constants (env `BD_FAST=1` shortens for bots):

| Name | Value | `BD_FAST` |
|---|---|---|
| `READY_T` / `COUNT_T` | 3 / 3 s | .5 / .5 |
| `AFTER_FIRST` | 20 s | 5 |
| `LEVEL_CAP` | 240 s | 60 |
| `RESULT_T` / `FINAL_T` | 7 / 12 s | 1 / 2 |
| track length | spec | `opts.len = 60` |
| `SPIN_T`, `INVULN` | 2, 1.3 s | same |
| `BOARD_T`, `BOARD_R`, `BOARD_V` | .8 s, 2.2 m, 1.2 m/s | same |
| `COIN_R`, `HIT_R`, `HIT_V` | .9 m, .9 m, .5 m/s | same |
| `OFF_LIMIT` | 6 m | same |
| `SWAP_T`, `STALL_T`, `SIG_GAP` | 5 s, 1 s, .15 s | same |

Per tick during `race`, for each team: if no `car` message for `STALL_T`, set `v = 0`; if not spinning and not invulnerable, spin out on `dist > OFF_LIMIT` or a crosser hit; boarding progress per stop (decays at half speed when outside); coin pickup; finish when `nearest.i >= finishI` and `dist <= rw + .6`. Spin-out: set `spinT`, send `fix` to the driver with the nearest centre-line point and track heading, `fx spin`. Finishing order within one tick: larger `i` (then smaller team id) first. Level ends when every team with a connected member has finished, `AFTER_FIRST` after the first finish, or `LEVEL_CAP`. Signals: from a navigator of a team, `k` integer 0–7, rate-limited per sender, delivered to that team's driver after `settings.delay` seconds, `sent` echoed to the sender.

- [ ] **Step 1: Failing tests** using a fake `api` (collects sends, lets the test drive `tick(dt)` and inject messages):
  - `flow: ready -> count -> race -> result -> next level -> final -> end` with 4 players in 2 teams and `levels: 2`; `api.end` called once with the winning team's member ids; roles rotate (level 2 driver is the other member).
  - `race: driving to the finish ranks teams and scores` — feed `car` poses along `pts` for team A ahead of B; A gets place 1 (300), B place 2 (200); `level` message contains both.
  - `race: same-tick finish` (Review Focus 4).
  - `race: boarding needs 0.8 s slow inside the ring; coins picked once` — passengers/coins counted per team only.
  - `race: off-road over 6 m spins out and sends fix; moves ignored for 2 s`.
  - `race: crosser hit spins out` — place the car at `crosserPos` while `onRoad` with `v = 2`.
  - `messages: garbage ignored` (Review Focus 2) — `car` with NaN/strings, `car` from a navigator, `sig` with `k` 9, −1, `'2'`, signals faster than 0.15 s: no throw, no state change, no `sig` delivered.
  - `stall: no car message for 1 s -> v 0 in snapshot` (Review Focus 1).
  - `disconnect: driver offline 5 s -> teammate drives; rejoin -> navigator until next level` (Review Focus 3) — check `roles` messages and that `init` is re-sent on rejoin.
  - `leave: team down to 1 -> solo` — remaining member is driver with `role: 'solo'` in their `init`/`roles`.
  - `fewer than 2 connected players -> api.end([])` (spec 6), checked on the next tick after the drop.
  - `all members of a team offline -> it does not hold up the level end` — the other team finishing ends the level after `AFTER_FIRST` or immediately if it is the only team with a connected member.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `class BlindDrive` with `start/tick/onMsg/onRejoin/onDisconnect/onLeave`. `start()` calls `balance` on connected players' `{id, team}`. `init` per spec 4.5 with `me: {team, role: 'driver'|'nav'|'solo'}`. Snapshot `s` 20/s to everyone; `cr` holds crosser positions. Random map never repeats the previous level's map.
- [ ] **Step 4: Run** `npm test` — PASS; `npm start` boots; delete the old drive folders and confirm `git grep -n "games/drive"` returns nothing.
- [ ] **Step 5: Commit** `feat(blinddrive): race flow, teams, spin-outs, disconnects; remove 2D Blind Drive`.

### Task 6: Bot match `--drive`

**Files:**
- Modify: `test/bot-match.js`

**Interfaces:**
- Consumes: Task 5 messages; `BD.stepCar`, `BD.envAt`, `BD.nearestOnTrack` via `require('../public/games/blinddrive3d/shared.js')`.

- [ ] **Step 1: Add mode** `node test/bot-match.js --drive PORT N` (N = 3 or 4): N bots join one room, pick teams (`profile {team}`: N=4 → 0,0,1,1; N=3 → 0,0,0), host sets `{game:'blinddrive', settings:{levels:2}}` and starts. Driver bots run `stepCar` at 20 Hz steering toward `pts[i+3]` with `gas: 1`, slowing to stop 1 s in each stop ring; navigator bots send a random `sig` every 1.5 s. The script prints each `level` result and exits 0 after `final` arrives for every bot, 1 on any timeout (90 s per level).
- [ ] **Step 2: Run** `BD_FAST=1 PORT=3101 node server/index.js` in the background, then `node test/bot-match.js --drive 3101 4` and `node test/bot-match.js --drive 3101 3` — both exit 0 and print two level results with places and passengers. Also run the existing full Hide & Seek bot match (`HS_HIDE_T=2 HS_ROUND_T=20 PORT=3100 node server/index.js` + `node test/bot-match.js 3100`) — exit 0.
- [ ] **Step 3: Commit** `test(blinddrive): bot match mode`.

### Task 7: Browser world, car and cameras

**Files:**
- Create: `public/games/blinddrive3d/world.js`, `car.js`, `client.js`, `ambient.js`
- Modify: `public/app.js` (`GAMES = { hideseek: HideSeek, blinddrive: BlindDrive }`), `public/index.html` (`<script src="games/blinddrive3d/shared.js"></script>` after `core3d/animals.js`), `public/core3d/assets.js` (in `loadModel`, set `metalness = 0` on every loaded material)

**Interfaces:**
- Consumes: `engine` (`setScene`, `onFrame`, `camera`, `quality`, `isTouch`), `makeScene`, `followSun`, `assets.prop/pet/instanced`, `window.BD`.
- Produces:
  - `buildWorld(track, quality) → Promise<World>`; `World = { scene, stops: [{ring, pet, sign}], coins: Mesh[], crossers: Pet[], tick(dt, t, cam: {x,z}), setDriverView(on: bool), dispose() }`. Terrain grid follows `BD.heightAt`, coloured lighter toward hilltops; road/shoulder/centre dashes follow the terrain (+.05/.09/.12 m); flat discs (slicks, rings) tilt to the terrain normal. Scenery is added in Task 10; this task places only game objects.
  - `makeCar(teamColor: string, driverCode: number) → Promise<CarView>`; `CarView = { root, setPose(x, z, a, y, pitch), setRiders(codes: number[]), setGhost(on: bool), spin(t), tick(dt), dispose() }`. `setGhost` → 50% opacity + team flag. Car and its pets use cloned materials with `fog = false` (pets from `assets.pet` share materials — clone them).
  - `client.js` exports `mount(ctx)`, `unmount()`, `onMsg(d)`, `onEmote(id, e)`, following `hideseek3d/client.js` (queue messages while `init` builds the world).
  - `makeAmbient(theme, scene, mobile) → {tick(dt, cam), dispose()}`: butterflies (country), falling snow (snow), sea sparkles (beach), fireflies (night) — adapt `hideseek3d/ambient.js`, halved on phones.
- Driver view: `scene.fog = Fog(bg, 1.2, 5.4)` with background `#eaf2f9`, other teams' cars hidden, frosted overlay element from the mockup. Navigator camera: 10 m behind, 9.5 m up, look 4.5 m ahead; driver camera: 4.6 m behind, 2.7 m up (spec 5). Own car (driver): simulated locally with `stepCar` + `envAt` each frame, sent as `car` at 20 Hz, snapped by `fix`. Other cars: snapshot interpolation 110 ms behind.

- [ ] **Step 1: Implement** world, car, client, ambient; register in `app.js` and `index.html`; apply the `metalness = 0` change.
- [ ] **Step 2: Browser check** (preview `farm` server on 3000 + `node test/bot-match.js --lobby CODE 3000 3` bots, pick teams, start Blind Drive): Country map renders with hills, road, stops, coins, slick, crossers, finish arch; navigator camera follows own car; driver view shows only the car in fog; no console errors. Then open Hide & Seek on all three maps and compare trees with the pre-change screenshots: if trees look washed out, lower its `brighten` values (`world.js` THEME table) until they match.
- [ ] **Step 3: Commit** `feat(blinddrive3d): world, car and cameras; metalness fix for Kenney models`.

### Task 8: HUD, controls and sound

**Files:**
- Create: `public/games/blinddrive3d/hud.js`, `hud.css`
- Modify: `public/games/blinddrive3d/client.js`

**Interfaces:**
- Produces: `class Hud(L, {isTouch, onSignal(k), onDriveInput()})` with `setRole(role: 'driver'|'nav'|'solo', teamName, partnerNames)`, `update(snapshot, me)`, `showSignal(k)`, `sent(k)`, `feel(text, color)`, `danger(0..1)`, `speed(v)`, `destroy()`; exported `SIG` (8 rows from spec 2.6: label, big text, key code(s), colour, icon SVG from the mockup), `DRIVE_KEYS = {left:['KeyA','ArrowLeft'], right:['KeyD','ArrowRight'], gas:['KeyW','ArrowUp'], brake:['KeyS','ArrowDown'], rev:['KeyR']}`.
- "Something nearby?" = max over: nearest crosser ahead on the road within 12 m, slick ahead within 8 m, `edge` within 1 m of `OFF_LIMIT`. "Road feels": Slippery! when `slick`, Off road! when `off`, Uphill when `slope > .06`, Downhill when `< -.06`, else Flat.
- Sounds via `sfx.beep`: engine hum (driver only, pitch 90 + 40·|v| Hz, low volume), one tone per signal (`[520, 660, 780, 900, 440, 330, 380, 600]` Hz), rumble on grass, `sfx.splash` on spin, coin ting, `sfx.animal(code)` on boarding, `vibrate(120)` on spin.

- [ ] **Step 1: Implement** HUD (layout and styles from mockup `drive3d.html`, incl. phone layout), keyboard + touch controls for both roles, sounds.
- [ ] **Step 2: Browser check** at desktop size and 375x812 for both roles: navigator buttons and keys send signals and show "Sent!"; driver sees the call card + history, gauge, meter, road feel; touch buttons and keys drive the car; no overlap between HUD pieces (feed sits below the call card in driver view).
- [ ] **Step 3: Commit** `feat(blinddrive3d): navigator and driver HUD, controls, sound`.

### Task 9: Overlays (Get Ready, countdown, results, podium)

**Files:**
- Create: `public/games/blinddrive3d/overlays.js`
- Modify: `public/games/blinddrive3d/client.js`

**Interfaces:**
- Produces: `class Overlays(L, {sfx, isTouch})` with `getReady(level, levels, themeName, teams)`, `countdown(n)`, `finishBanner(place)` ('1st!', '2nd!', '3rd!', '4th!'), `levelResults(rows)` (team colour, place, passengers, coins, points, total), `podium(rows, scene)` (team animals on steps, reuse the Hide & Seek podium approach and its `.final` class to hide the HUD), `close()`.

- [ ] **Step 1: Implement.** Overlays never block canvas clicks (decorative descendants `pointer-events:none!important`, as in Hide & Seek).
- [ ] **Step 2: Browser check** with bots and `BD_FAST=1`: Get Ready lists each team's driver and navigators, countdown then GO, banner on finishing, results after each level, podium at the end, then back to the lobby with teams kept.
- [ ] **Step 3: Commit** `feat(blinddrive3d): get ready, results and podium overlays`.

### Task 10: Scenery layout and four maps

**Files:**
- Modify: `public/games/blinddrive3d/shared.js` (add `layout`, `SCENERY`)
- Modify: `public/games/blinddrive3d/world.js`
- Test: `test/blinddrive.test.js`

**Interfaces:**
- Produces: `BD.SCENERY[theme] = { small: [[kind, path, height, radius]], roadside: [...], big: [...], clusters: [...] }` and `BD.layout(track, seed) → [{kind, x, z, rot, scale, r}]` where `r` is the footprint radius already scaled. Cluster kinds expand into several items (field rows, pond parts) each with its own `r`.
- Distance rules (spec 3.4) measured as `nearestOnTrack(x,z).dist - r`: `small` ≥ 2.5 and only up to height .6 m; stop sign/pet excluded (placed by the world from `stopPoints`); `roadside` (fences, lamps) ≥ 6.3; `big` and every cluster item ≥ 6.5. No two items overlap (`dist ≥ r1 + r2`, small items excepted among themselves). Densest between 6.5 and 14 m.
- Theme content (spec 3.2): country — fields (corn/pumpkin/wheat/carrot + furrows + fences), ponds (water, lilies, reeds, canoe, watermill on the far side), camps, market stalls, windmill, oak/default/fat/detailed trees; snow — `platformer/tree-pine-snow*`, `nature/tree_pine*`, `holiday/snowman*`, cabins from `holiday/cabin-*`, sleds, presents, lanterns; beach — `pirate/palm-*`, `nature/tree_palm*`, boats, crates, barrels, `pirate/tower-complete-small`, flags, a sea plane on one side; night — `town/*` stalls, lanterns (emissive), fountain, hedges, banners, darker sky `#20305a`, headlights on cars.

- [ ] **Step 1: Failing test** `layout: no scenery on the road` — for 50 seeds × 4 themes × levels 0–5: every item obeys its band rule and no non-small pair overlaps.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `layout` (seeded with `BD.rng(seed ^ 0x5eed)`) and render it in `world.js` with `assets.instanced` per model path.
- [ ] **Step 4: Run** `npm test` — PASS. **Browser check** each map from the navigator camera: scenery visible on both sides within the camera band, nothing on road or shoulder, frame rate not lower than Hide & Seek on the same machine.
- [ ] **Step 5: Commit** `feat(blinddrive3d): scenery layout for four maps`.

### Task 11: Final verification and docs

**Files:**
- Modify: `README.md` (Blind Drive section: rules summary, controls, team picking; credits unchanged)

- [ ] **Step 1:** `npm test` — all pass. Bot runs from Task 6 (both drive modes + Hide & Seek full match) — exit 0.
- [ ] **Step 2:** Browser, spec section 1 criteria: 4 players = 2 teams and 3 players = 1 team of 3 (desktop + 375x812), full match to podium and back to lobby, no console errors; kill the driver tab mid-level → teammate drives after 5 s; reopen → rejoins as navigator. Hide & Seek full round still works.
- [ ] **Step 3:** `git grep -n -i "lái mò\|games/drive"` → nothing outside `docs/`. Update README. **Commit** `docs: Blind Drive in README`.
