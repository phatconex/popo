# Bonk Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bonk Island, a 2–12 player online brawler (shove friends off a breaking hex island; knocked-out players drop coconuts as ghosts), as Pawty's second game with 3 maps.

**Architecture:** One physics file (`public/games/bonk3d/shared.js`, UMD) runs on both sides. Each browser simulates its own animal and reports state at 20 Hz; the server (`server/games/bonk/`) validates moves and hit claims, owns the island break schedule, falls, coconuts, places and points, and simulates bodies whose owner is offline or silent. Other players are drawn 0.1 s behind with interpolation.

**Tech Stack:** Node ≥18 + `ws`, `node:test`, three.js 0.160.0 via importmap, Kenney CC0 GLBs already in `public/assets/kenney/`. No build step.

**Spec:** `docs/superpowers/specs/2026-11-07-bonk-island-design.md` (all numbers come from it). Approved mockup with the tuned feel, bot AI and HUD markup: `docs/superpowers/mockups/2026-11-07-bonk-island.html` — copy look, CSS and effects from it; it is reference, not shipped code.

## Global Constraints
- All visible copy English, font Lilita One, ink `#24304a`, no emoji anywhere (UI, feed, docs).
- Units are metres, angles radians, facing `f` = `atan2(dirX, dirZ)` (pet models face +Z). Round to 2 decimals on the wire.
- Every in-round message in both directions carries `rd` (round number); receivers drop mismatches.
- Do not touch `render.yaml`. Do not change Hide & Seek rules. Server tick stays 20 Hz (core `setInterval` 50 ms).
- Mobile (`engine.isTouch`): no shadows (use `quality.shadows`), as Hide & Seek.
- Env switches: `BK_FAST=1` (short timings, spec §4.5), `NET_LAG_MS` (core, both directions, half each). Unset = no change.
- Randomness on the server goes through `api.rand || Math.random` so tests are deterministic.
- Commit after each task with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line. No push.

## Review Focus
1. A player whose tab is in the background (no `st` for > 1 s) must not freeze in place unhittable: the server simulates their body like an offline one and sends `fix` when they come back — test in Task 3.
2. Garbage from a client (`NaN`, strings, `1e9`, unknown ids, missing fields) in `st` / `act` / `hit` / `nut` / `fall` never crashes the server or moves anyone — test in Tasks 3 and 4.
3. Messages from the previous round (`rd` mismatch) arriving after a new round starts are ignored — test in Task 3.
4. Nobody left standing (last two fall together): no 1st place, `win: null`, the last one out gets place 2 — test in Task 3.
5. A player leaving during the count, a round-end pause or the final pause never crashes and still ends the match correctly — test in Task 3.

## Files
| Path | Responsibility |
|---|---|
| `public/games/bonk3d/shared.js` | UMD (`window.BK` / `module.exports`): constants, hex math, body `step`, attack geometry, knock, separation, interpolation |
| `server/games/bonk/island.js` | island layout per map and player count, surfaces, obstacles, spawns, break schedule, map rotation |
| `server/games/bonk/index.js` | `meta`, `create(api)`: rounds, snapshots, validation, falls, combat, coconuts, scoring, disconnects |
| `server/core.js` | `lagMs` option (test switch) |
| `public/games/bonk3d/{client,world,fighters,fx,hud,overlays}.js`, `hud.css` | browser game |
| `public/core3d/podium.js` | podium scene extracted from Hide & Seek, used by both games |
| `test/bonk-shared.test.js`, `test/bonk-island.test.js`, `test/bonk.test.js`, `test/core.test.js`, `test/bot-match.js` | tests |

---

### Task 1: Shared physics (`shared.js`)

**Files:** Create `public/games/bonk3d/shared.js`; Test `test/bonk-shared.test.js`

**Interfaces — Produces** (all on one object `BK`, exported via `module.exports` and `window.BK`, same pattern as `public/core3d/animals.js`):
- Constants: `S = 1.05`, `WATER_Y = -1.15`, `FALL_Y = -1.1`, `GRAV = 24`, `BODY_R = .4`, `STEP = 1/120`, `TURN = 14`, `FR_AIR = .9`, `CHARGE_T = .9`, `CHARGE_SPEED = 1.7`, `SURF = [{speed:4.4,accel:14,fric:4}, {speed:4.4,accel:4,fric:1.8}, {speed:2.6,accel:14,fric:9}]` (0 normal, 1 ice, 2 mud), `CD = {push:.45, bonk:1.1, dash:2.2, nut:3.5}`, `PUSH = {range:1.25, cone:1.15, power:4.6, vy:1.8, stun:.3, nudge:2}`, `BONK = {lungeT:.2, lungeV:[7,3], ahead:.55, radius:.9, power:[4.5,5.5], vy:[2,2.5], stun:[.35,.5], hitLungeT:.06, hitSlow:.3}`, `DASH = {t:.2, v:10}`, `BUMP = {min:4.5, share:.45, stun:.2, vy:1.2}`, `NUT = {h:9, g:14, r:1.4, power:4.8, vy:3, stun:.5, aim:7}`, `KO_WINDOW = 4`, `REACH = {push:1.25, bonk:1.45, dash:.8}`.
- `hexToXZ(q, r) -> [x, z]`, `xzToHex(x, z) -> [q, r]` (cube rounding), `ring(q, r) -> number`, `islandRadius(rings) -> √3·S·rings + S`.
- `newBody(x, z, f) -> Body` with fields `x z y vx vz vy f stun lunge lungeC dash charging charge falling` (numbers/booleans, all zero/false except position and `f`).
- `step(b, inp {mx, mz}, dt, groundAt) -> 'fall' | 'land' | null`: substeps of ≤ `STEP`; `groundAt(x, z)` returns `-1` (no tile or dropped) or the surface index 0/1/2. Rules per spec §3.2: control and turning only when not stunned/lunging/dashing; desired speed `SURF[s].speed` (or `CHARGE_SPEED` while charging) reached via `1 - e^(-accel·dt)`; stunned → `v *= e^(-fric·dt)` on ground, `e^(-FR_AIR·dt)` airborne; charging grows `charge` by `dt / CHARGE_T` to 1; `lunge`/`dash` timers count down; gravity when `y > 0 || vy > 0`; landing on `-1` or standing on `-1` sets `falling` and returns `'fall'` once. While falling: gravity, horizontal decay `e^(-.6·dt)`, no control.
- `startBonk(b)`, `releaseBonk(b) -> c | -1` (sets `lunge = BONK.lungeT`, `lungeC = c`, velocity `lungeV[0] + lungeV[1]·c` along `f`), `startPush(b)` (adds `nudge` along `f`), `startDash(b)` (velocity `DASH.v` along `f` for `DASH.t`, cancels charge). Each returns `false` if stunned/falling/lunging (cooldowns are tracked by callers).
- `pushTargets(att, others) -> others[]` (distance ≤ `range`, `|angle diff| ≤ cone`), `bonkTouch(att, o) -> bool` (`att.lunge > 0` and `o` within `radius` of the point `ahead` in front), `hitDir(att, o) -> [dx, dz]` = normalize(.7·facing + .3·toward target).
- `knockOf(kind, x) -> {power, vy, stun}` for `push | bonk | nut | bump`: bonk uses `x` = charge 0–1 (power `4.5 + 5.5x`), bump uses `x` = closing speed (power `BUMP.share·x`, `BUMP.vy`, `BUMP.stun`).
- `applyKnock(b, dx, dz, k)`: `v = d·power + v·.2`, `vy = max(vy, k.vy)`, `y = max(y, .001)`, `stun = max(stun, k.stun)`, cancels charge, lunge, dash.
- `separate(b, others)`: push `b` fully out of each overlapping other (height difference ≤ .7), others untouched (own body only).
- `interp(buf, t) -> [x, z, y, f, fl, ch] | null`: `buf` rows are `[t, x, z, y, f, fl, ch]` sorted by `t`; `x z y` linear between neighbours, `f` the short way round, `fl ch` from the nearer sample; clamped at the ends; `null` for an empty buffer.

- [ ] **Step 1: Write the failing tests** in `test/bonk-shared.test.js` (helper `flat = () => 0` ground everywhere, `edge(R)` = 0 inside radius `R`, `-1` outside; simulate with `step` at dt `1/60` until stun ends and speed < .05):
  - `push slides 1–2 m`: knock a body with `knockOf('push')` → distance travelled in [1, 2].
  - `full bonk slides 4–6 m`: `knockOf('bonk', 1)` → [4, 6]; `bonk c=0` < `bonk c=1`.
  - `ice slides further, mud shorter`: same bonk on surface 1 > surface 0 > surface 2; walking top speed on mud ≤ 2.65.
  - `missed bonk at the edge falls in`: body at `x = R - .5` facing out, `releaseBonk` with c=1, ground `edge(R)` → `step` returns `'fall'` and later `y < FALL_Y`.
  - `xzToHex inverts hexToXZ` for every tile with ring ≤ 5, and for points .5·S from a centre toward each neighbour.
  - `pushTargets` honours range and cone; `bonkTouch` only while lunging.
  - `interp` midpoint, clamps, and angle wrap (`f` from 3.1 to -3.1 goes through π, not 0).
- [ ] **Step 2:** `node --test test/bonk-shared.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement `shared.js` as specified above (the mockup's `stepFighter`, `push`, `bonkRelease`, `lungeHits`, `hit`, `blend` are the reference behaviour).
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit `feat(bonk): shared physics`.

### Task 2: Island and schedule (`island.js`)

**Files:** Create `server/games/bonk/island.js`; Test `test/bonk-island.test.js`

**Interfaces — Consumes:** `BK.hexToXZ`, `BK.ring`, `BK.islandRadius`, `BK.S` from Task 1. **Produces:**
- `T = {count:3, first:15, every:12, warn:3, hold:20, single:4, pause:6, final:12}`, `FAST_T = {count:1, first:3, every:3, warn:1, hold:3, single:1, pause:2, final:3}`.
- `ringsFor(n) -> 3 | 4 | 5` (2–4 / 5–8 / 9–12).
- `makeIsland({ n, map, rand, T }) -> { map, rings, tiles: [{q, r, ring, surf}], obst: [[q,r],[q,r]], surf: [[q,r,1|2]], spawn: [[x,z,f]] (n entries), breaks: [[q, r, warnAt, dropAt]] }`.
- `mapPicker(setting, rand) -> (roundIndex) => 'beach' | 'snow' | 'farm'`.
- `tileState(brk, c) -> 'ok' | 'warn' | 'drop'` (`c < warnAt` ok, `< dropAt` warn, else drop).

Rules: obstacles = a random ring-2 tile and its opposite `(-q, -r)`. Spawns evenly on radius `.6·islandRadius(rings)`, facing the centre; rotate the start angle in steps of 0.1 rad until every spawn is ≥ 1 m from both obstacle centres. Snow: `round(.4·tiles)` ice tiles grown from 3–5 random non-centre seeds by random neighbour expansion; centre is never ice. Farm: mud count 4 / 6 / 8 for rings 3 / 4 / 5, never outer ring, centre or obstacle tiles. Breaks: for ring = rings down to 2, two halves per ring (first half = contiguous arc of `ceil(len/2)` tiles by angle from a random start angle), break `k` has `warnAt = first + k·every`, `dropAt = warnAt + warn`; then the 6 ring-1 tiles one at a time: first `warnAt = lastHalfDrop + hold`, then `+ single` each. The centre never breaks. Random map: one random permutation of the 3 maps picked when the picker is created, returned as `perm[roundIndex % 3]` (any 3 consecutive rounds cover all maps, spec §2.2; ledger Ruling 7).

- [ ] **Step 1: Failing tests** in `test/bonk-island.test.js` with a seeded `rand` (e.g. mulberry32):
  - tile counts 37 / 61 / 91 for n = 3 / 6 / 10; `ringsFor` boundaries (4→3, 5→4, 8→4, 9→5, 12→5).
  - rings 4, `T`: 60 breaks; first `warnAt` 15; half-breaks at 15, 27, 39, 51, 63, 75; singles at 98, 102, 106, 110, 114, 118; every `dropAt - warnAt === 3`; centre `(0,0)` absent; each half is one contiguous arc (consecutive by angle).
  - rings 3 last single `warnAt` 94; rings 5 last single 142.
  - snow ice ratio in [.35, .45] of tiles, centre not ice; farm mud count 4/6/8, none on outer ring, centre or obstacles; beach has no `surf`.
  - spawn: n entries, all on tiles with `tileState === 'ok'` at c=0, ≥ 1 m from obstacles, pairwise ≥ 1 m apart, facing within .01 rad of the centre direction.
  - `mapPicker('random')`: every sliding window of 3 over rounds 0..29 has all 3 maps; same index gives the same map; `mapPicker('snow')` always snow.
  - `FAST_T` schedule for rings 3 ends before c = 30.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit `feat(bonk): island layout, surfaces and break schedule`.

### Task 3: Server round flow, movement, falls, scoring, disconnects

**Files:** Create `server/games/bonk/index.js`; Test `test/bonk.test.js`

**Interfaces — Consumes:** Task 1 `BK.*`, Task 2 `makeIsland`, `mapPicker`, `tileState`, `T`, `FAST_T`. **Produces:**
- In `shared.js` (ledger Ruling 8, obstacle collision was unassigned): `BK.OBST_R = .38`, `BK.hitObstacles(b, centres)` — push `b` out of each circle of radius `OBST_R + BODY_R`; if it was moving inward, remove 1.5 × the inward normal speed (mockup behaviour). Test in `test/bonk-shared.test.js`. Server sim, bots and the client call it with the centres of obstacle tiles not in state `drop`.
- `meta = { id:'bonk', name:'Bonk Island', desc:'Shove your friends into the sea. Last paw standing wins!', min:2, max:12, tag:'Brawl', settings:[ {key:'map', label:'Map', def:'random', options:[random 'Random', beach 'Beach', snow 'Snow', farm 'Farm']}, {key:'rounds', label:'Rounds', def:'5', options:['3','5','7'] (labels same)} ] }`.
- `module.exports = { meta, create: api => new Bonk(api), _test: { T, FAST_T } }`. Timings `T`/`FAST_T` chosen by `process.env.BK_FAST === '1'` at load.
- Per-player record `g`: `{ id, name, av, body, out, ghost, place, ko, got, total, online, lastSt (server clock of last accepted st), hist: [[c,x,z]] (0.5 s), offGround (s), fallT, acts: {push|bonk|dash: {q, at}}, hits: Set of "q:id", lastHit: {by, a, at} , nutAt, knockV }`.
- Server → client messages exactly as spec §4.2 (`round`, `s`, `fix`, `out`, `roundEnd`, `final`), each with `rd`. `roundEnd` also carries `last: bool`. Rejoin: send `round` (same object as the round start, with current `c`) then `fix` with the body.

Behaviour: `start()` → records for `api.players()`, `total = +rounds` (3/5/7 else 5), first round. Round: `rd++`, `makeIsland`, bodies at spawns, phase `count` with `c = -T.count`; `c >= 0` → phase `play`. Every tick: `c += dt`; bodies that are offline or silent (`c - lastSt > 1`) step on the server with zero input; fall check per spec §4.3 (reported `fall`, or `y ≤ 0` and off a solid tile for > 0.5 s) → `falling`, `out` 0.6 s later (`place = notOut + 1`, credit KO if `lastHit` within `KO_WINDOW` and by someone else); snapshot `s` each tick. Round ends when ≤ 1 not-out and none falling: survivor place 1; if nobody is standing, nobody gets place 1 — the player with place 1 is moved to 2 and `win: null` (ruling for the spec's "no 1st place"). Points `[5,3,2,1]` by place, 0 after, `+ko`. Pause `T.pause`, then next round. Last round: broadcast `roundEnd {last:true}` and `final {rows:[{id,total,rank}]}` together; after `T.final` (12 s: client shows results 4 s, then podium ~8 s — ruling for spec §2.3.7) call `api.end(ids with the top total > 0)`. `st` (alive, not falling, matching `rd`): all of x, z, y, vx, vz, vy, f must be finite and |value| < 100, else ignore; displacement limit `max(10, |knockV|)·dt·1.5 + .5` since last accepted (dt from server clock), else send `fix`. `onDisconnect` → offline; `onRejoin` → online, resend; `onLeave` → if alive: out now; then fewer than 2 players: at the last round's end/final phase → finish, else `api.end([])`.

- [ ] **Step 1: Failing tests** (`fakeApi(n, settings, rand)` like `test/hideseek.test.js`, also recording `send` per player; drive time with `game.tick(.05)`):
  - meta: name `Bonk Island`, setting labels `['Map','Rounds']`, rounds options `3/5/7` default `5`, map default `random`.
  - start broadcasts `round` with `rd:1`, `of:5`, `spawn` for every id, `c:-3`; phase becomes play after 3 s.
  - `st` within limits is accepted (next `s` shows it); a 5 m jump in one tick gets `fix`; `st` with `x:'abc'`, `x:NaN`, `x:1e9`, missing fields: ignored, no throw (Review 2).
  - `st` with `rd` of a previous round is ignored (Review 3).
  - standing on a tile after it drops → falling then `out` within 0.6 s + 0.5 s; reported `fall` → `out` 0.6 s later.
  - silent client: no `st` for 1.2 s, then its tile drops → server falls it out; a `st` after a long silence far from the server body → `fix` (Review 1).
  - places and points: 4 players out in order A, B, C → D place 1 with 5 pts, C 3, B 2, A 1; `ko` adds 1 each.
  - nobody standing: last two reported `fall` on the same tick → `roundEnd.win === null`, no row with place 1, last-out has place 2 (Review 4).
  - disconnect: body stays, steps on the server, falls when its tile drops; rejoin → `round` then `fix` sent to that player.
  - leave while alive → `out`; leave in count, in round-end pause and in final pause with 3 then 2 players → no throw; 2 → 1 player ends via `api.end` (final at last round, `[]` otherwise) (Review 5).
  - full match with `FAST_T` and scripted falls: 3 rounds (`rounds:'3'`) → 3 `roundEnd`, one `final`, `end` called once with the top scorer.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit `feat(bonk): server round flow, falls, scoring and disconnects`.

### Task 4: Server combat, bumps and coconuts

**Files:** Modify `server/games/bonk/index.js`; Test `test/bonk.test.js`

**Interfaces — Consumes:** Task 1 `knockOf`, `REACH`, `CD`, `NUT`, `BUMP`; Task 3 records. **Produces:** handling of `act`, `hit`, `nut` and server `knock`/`fx` messages per spec §4.2–4.3; snapshot field `nuts: [[x, z, landAt]]`.

Behaviour: `act {a, q, c}` accepted when phase play, sender alive, not falling, not stunned on the server copy, `c ≥ at + CD[a] - .1` → store `{q, at:c}`, broadcast `fx {a, id, x, z, c}`. `hit {id, a, q, c, dx, dz}` accepted when a matching act (same `a`, same `q`) is ≤ .4 s old, `"q:id"` not used yet, target alive and not falling, and the target's history in the last .4 s has a point within `REACH[a] + .6` of the attacker's current position. Then `k = a === 'dash' ? knockOf('bump', DASH.v) : knockOf(a, clamp(c,0,1))`, direction = normalized `(dx, dz)` (fallback: attacker→target), set target `lastHit`, `knockV = k.power`; online target → `send knock {vx, vz, vy, stun, by, a}`; offline/silent target → `applyKnock` on the server body. Bumps: each tick for pairs of not-out, not-falling bodies where one is airborne-stunned or dashing (from `st` flags or server sim), overlapping and closing faster than `BUMP.min` → knock the other with `BUMP` share of the closing speed, credit per spec §3.4; one knock per pair per .3 s. `nut {x, z}` from an out player whose `nutAt + 3.5 ≤ c`, point within `islandRadius + 1`, finite → coconut `{x, z, by, landAt: c + sqrt(2·NUT.h/NUT.g)}`; at `landAt`: on a solid tile → `knockOf('nut')` radially to every alive body within `NUT.r`, `fx {a:'thunk'}`; else `fx {a:'splash'}`.

- [ ] **Step 1: Failing tests:**
  - plausible push `act` + `hit` at 1 m → victim gets `knock` with speed ≈ 4.6 and `by`; same `q` twice → one knock.
  - rejected: hit with no act, act on cooldown (second push .2 s later), target 3 m away, stunned attacker, falling or out target, unknown `id`, `dx:NaN` (falls back to attacker→target) (Review 2).
  - bonk `c:1` knock speed 10, `c:5` clamped to 10.
  - KO credit: victim knocked, falls within 4 s → hitter `ko` 1; after 4 s → nobody; self-fall → nobody.
  - offline victim is moved by the hit on the server.
  - bump: a dashing body overlapping a still one with closing speed 10 → the still one gets a knock; repeated within .3 s → no second knock.
  - coconut: ghost `nut` lands after ≈ 1.13 s and knocks a body 1 m away; a body 2 m away untouched; alive player `nut` ignored; second `nut` within 3.5 s ignored; `x:1e9` ignored; KO from a coconut credits the ghost.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit `feat(bonk): server combat, bumps and coconuts`.

### Task 5: Lag switch, registration, bot matches

**Files:** Modify `server/core.js`, `server/index.js`, `test/core.test.js`, `test/bot-match.js`

**Interfaces — Produces:** `new Core(games, { lagMs })` — when `lagMs > 0`, every outgoing message and every incoming message is delayed `lagMs / 2` (order preserved); `server/index.js` passes `{ lagMs: +process.env.NET_LAG_MS || 0 }` and registers `bonk: require('./games/bonk')`. Bot modes: `node test/bot-match.js --bonk PORT N` (N = 2–6; a bot hosts, sets `{game:'bonk', settings:{rounds:'3'}}`, all ready, host starts; exits 0 printing per-round places and `OK` after `final` and the return to lobby, exits 1 on timeout) and `--bonk-join CODE PORT N` (bots join a human's room and play until Ctrl+C). Bots simulate their own body with `BK.step` (require `public/games/bonk3d/shared.js`) against the `round` tile schedule, send `st` at 20 Hz, walk to the nearest other, `act`+`hit` when `pushTargets`/`bonkTouch` say so, send `fall` on `'fall'`, apply `knock`/`fix`, and as ghosts send `nut` at a random alive body every 4–7 s (mockup `botThink` is the reference, including edge avoidance).

- [ ] **Step 1: Failing test** in `test/core.test.js`: `core: lagMs delays both directions` — with `lagMs: 100`, a `join` does not produce `lobby` synchronously; after 60 ms it does; with `lagMs` unset the existing tests stay synchronous.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement core option, registration and bot modes.
- [ ] **Step 4:** `npm test` → pass; `BK_FAST=1 PORT=3101 node server/index.js` then `node test/bot-match.js --bonk 3101 4` → prints 3 rounds and `OK`; repeat with `NET_LAG_MS=250` → `OK`; `node test/bot-match.js 3101` (Hide & Seek) still `OK` on a plain server.
- [ ] **Step 5:** Commit `feat(bonk): lag test switch, registration and bot matches`.

### Task 6: Client scene (world, fighters, effects) and wiring

**Files:** Create `public/games/bonk3d/{client,world,fighters,fx}.js`; Modify `public/app.js`, `public/index.html`, `public/core3d/screens/lobby.js`

**Interfaces — Consumes:** `round` / `s` / `out` / `fx` messages (Tasks 3–4), `window.BK`. **Produces:**
- `world.js`: `buildWorld(round, quality) -> Promise<{ scene, update(dt, t, c), solidAt(x, z) -> -1|0|1|2, radius(c), ghostCloud, dispose() }>` — tiles, foam, sea or lake, horizon scenery, clouds, colours and models per spec §2.6 table; warn tiles pulse to `#ff4d5e`, shake and sink .12 m; dropping tiles fall and splash. `solidAt` uses `tileState` semantics with the client round clock.
- `fighters.js`: `class Fighters { constructor(scene, layer); add(id, {av, name, color, me}) -> Promise; set(id, {x,z,y,f,fl,ch}, dt, t); out(id); ghost(id, seatIndex, cloud); remove(id); dispose() }` — pet via `assets.pet(av, .85)`, tilt/tumble/daze/charge ring/shadow/name tag/own facing arrow exactly as the mockup; `fl` bits from spec §4.2 drive the pose.
- `fx.js`: `class Fx { constructor(scene, layer, camera); splash(x,z,big); stars(x,y,z,n,p); dust(x,z,n); pop(x,y,z,text,size,color); nut(x,z,landAt) ; shake(a); hitstop(ms); update(dt, c) ; dispose() }`.
- `client.js` exports `mount(ctx)`, `unmount()`, `onMsg(d)`, `onEmote(id, e)` (same contract as `hideseek3d/client.js`, including the async-build guard `buildId` and queueing messages while a round is building). In this task it renders every player from snapshots only (no own control yet) with the camera rule of spec §5.1.
- Wiring: `GAMES.bonk` in `app.js`; `games/bonk3d/hud.css` link (empty file allowed until Task 8) and `<script src="games/bonk3d/shared.js">` in `index.html`; `ART.bonk` (hex island, two small animals, a star, viewBox `0 0 120 62`) and `GAME_COL.bonk = '#4fb4ff'` in `lobby.js`.

- [ ] **Step 1:** Implement the four modules and wiring.
- [ ] **Step 2: Verify in the browser:** `PORT=3000 node server/index.js`; open the app, Play, host picks Bonk Island (card shows art); `node test/bot-match.js --bonk-join CODE 3000 3`; start with each Map setting (Beach, Snow, Farm): island, obstacles, ice/mud colours, sea/lake, horizon match spec §2.6; bots move smoothly; tiles warn and drop on schedule; splash on `out`; no console errors; Hide & Seek still starts.
- [ ] **Step 3:** Commit `feat(bonk): client world, fighters and effects`.

### Task 7: Client netcode and controls

**Files:** Modify `public/games/bonk3d/client.js`

**Interfaces — Consumes:** Task 1 (`step`, `startPush`, `startBonk`, `releaseBonk`, `startDash`, `pushTargets`, `bonkTouch`, `hitDir`, `separate`, `applyKnock`, `interp`), Task 6 modules. **Produces:** own-body loop and the client half of spec §4: input → `step` each frame with `world.solidAt`; `st` every 50 ms with the `fl` bitmask; `act` on each press with a per-round counter `q`; `hit` from local detection against interpolated others (push at press, bonk during lunge, dash while dashing and overlapping); on own hit: `fx` stars/pop, shake by charge, hitstop 60 ms; `knock` → `applyKnock` (ignored while falling or out); `fix` → overwrite body; `'fall'` → send `fall` once; `out` for me → ghost after 0.9 s, reticle moves at `NUT.aim` m/s clamped to `world.radius(c)`, `nut` on press (local cooldown 3.5 s). Others: per-id buffer of `[c, x, z, y, f, fl, ch]`, drawn at `clock - .1` via `interp`. Round clock: `clock = lastSnap.c + (now - lastSnapAt)`, nudged toward each new snapshot by 10%. Keys: WASD/arrows, `J` push, hold `K` bonk, `Space`/`L` dash; ghost: `J`/`Space`/`K` coconut. Hidden tab: on `visibilitychange` back to visible, wait for the next `fix` or snapshot before stepping. Drop messages with a different `rd`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify:** two tabs plus `--bonk-join` bots on a server started with `NET_LAG_MS=250 BK_FAST=1`: own animal responds instantly; a push/bonk that touches on the attacker's screen knocks the victim in the other tab; full-charge bonk sends a body ~5 m; ice slides, mud grips; falling sends `out` and the ghost can drop a coconut that knocks bots; switching a tab to the background for 5 s and back resumes without teleport loops; no console errors.
- [ ] **Step 3:** Commit `feat(bonk): client netcode and controls`.

### Task 8: HUD

**Files:** Create `public/games/bonk3d/hud.js`; Fill `public/games/bonk3d/hud.css`; Modify `client.js`

**Interfaces — Produces:** `class Hud { constructor(layer, { isTouch, onPress(a), onRelease(a) }); top({rd, of, alive, total, label, value, hot}); roster(rows [{id, name, color, ko, out}]); feed(html, bg); cooldown(a, frac); charge(c); ghost(on); move() -> [mx, mz] (joystick); destroy() }` and `KEYMAP`. Markup, CSS and copy from the mockup (top chips, roster, feed lines from spec §5.2, Push/Dash/Bonk/Coconut buttons with `kbd` labels, charge ring, cooldown sweep, joystick, desktop hint, ghost bar, phone portrait rules `max-width:760px`, sideways phone rules `max-height:500px and min-width:761px`). All class names prefixed `bk-`. Also: `ui.emoteControl` button; `sfx` beeps as the mockup plus `sfx.animal(<victim animal id>)` on `out`; vibrate on own knock only when `navigator.userActivation.hasBeenActive`.

- [ ] **Step 1:** Implement and hook into `client.js`.
- [ ] **Step 2: Verify** at 1280×800, 375×812 (touch: joystick visible, hint hidden) and 844×390: nothing overlaps the island centre or other HUD pieces; cooldown sweeps and charge ring move; ghost mode swaps the buttons; feed messages read as in spec §5.2; emotes show over animals.
- [ ] **Step 3:** Commit `feat(bonk): HUD`.

### Task 9: Overlays and shared podium

**Files:** Create `public/games/bonk3d/overlays.js`, `public/core3d/podium.js`; Modify `public/games/hideseek3d/overlays.js`, `public/games/hideseek3d/hud.css`, `public/core3d/ui.css`, `public/games/bonk3d/client.js`

**Interfaces — Produces:** `podium({ layer, engine, sfx, rows: [{id, name, score}], players, myId }) -> Promise<{ scene, tick(dt, t), dispose() }>` in `core3d/podium.js` — moved unchanged from `hideseek3d/overlays.js` `podium()`, CSS `.hs-podium`/`.hs-back` renamed `.podium`/`.podium-back` and moved to `core3d/ui.css`; Hide & Seek's `Overlays.podium` becomes a thin wrapper (and its `.hs.final` rule keeps `.podium`/`.podium-back` visible). `class Overlays { count(c) ('3','2','1','BONK!' from the round clock); big(html, ms) (SPLASH!, YOU WIN!, '<NAME> WINS!', 'DRAW!' with 'Last paw standing'); results(rows, players, myId, rd, of) (mockup card: #, colour, name, KOs, +points, total; footer note text from the mockup); closeResults(); }`. On the last `roundEnd`: results for 4 s, then the shared podium with `final` rows (score = total).

- [ ] **Step 1:** Extract the podium, then implement Bonk overlays.
- [ ] **Step 2: Verify:** a full `BK_FAST=1` match with bots shows countdown, round cards and the podium, then returns to the lobby; a full Hide & Seek bot match (`HS_HIDE_T=2 HS_ROUND_T=20`) still shows its podium with the same look; `npm test` passes.
- [ ] **Step 3:** Commit `feat(bonk): countdown, results and shared podium`.

### Task 10: Docs and final verification

**Files:** Modify `public/core3d/screens/open.js`, `README.md`

- [ ] **Step 1:** How to Play: add after the Hide & Seek lines, same markup:
  `<div><span><b style="background:#4fb4ff">BONK ISLAND</b> Shove everyone into the sea. <b style="background:#4fb4ff">Push</b> <b style="background:#ff5d6c">Bonk</b> (hold to charge) <b style="background:#55d36b">Dash</b>. The edge keeps breaking. Knocked out? Drop coconuts from your cloud.</span></div>`.
  README: a `## Bonk Island (2–12 players)` section (rules, maps and their twist, controls, points, `BK_FAST`, `NET_LAG_MS`, both bot modes) and the two new folders in Layout.
- [ ] **Step 2: Final verification:** `npm test`; `--bonk` bot match with and without `NET_LAG_MS=250`; Hide & Seek bot match; browser: desktop, 375×812 and 844×390, all three maps, two tabs at 250 ms lag, a full match to the podium and back to the lobby, no console errors.
- [ ] **Step 3:** Commit `docs(bonk): How to Play and README`.
