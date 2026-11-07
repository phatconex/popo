# Bonk Island — thiết kế (2026-11-07)

Game thứ hai của Pawty: đẩy nhau xuống biển, ai trụ cuối cùng thắng. Cùng thể loại với các game "đánh nhau văng khỏi sàn", nhưng tên, luật, nhân vật và hình ảnh là của Pawty (24 con thú Kenney Cube Pets có sẵn). Không sao chép tên, nhân vật hay map của game nào khác.

Mockup đã được duyệt: `docs/superpowers/mockups/2026-11-07-bonk-island.html` (bản offline có 5 bot; các con số dưới đây lấy từ mockup sau khi chỉnh). Mockup chỉ chạy khi được phục vụ cạnh `core3d/` và `assets/` (link tới `public/`), nó là tài liệu tham khảo, không phải code của game.

## 1. Mục tiêu

- 2–12 người chơi online trong một phòng Pawty, trên máy tính và điện thoại.
- Đẩy, đấm, lướt để làm người khác rớt khỏi đảo lục giác giữa biển. Mép đảo vỡ dần nên ván nào cũng kết thúc và có người thắng.
- Người bị loại không phải ngồi chờ: thành ma trên mây, thả dừa xuống phá.
- Chơi mượt với độ trễ khoảng 0,25 s (đo được tới server Render hiện tại).

### Không làm trong đợt này
- Đảo tuyết, đảo nông trại (chỉ một kiểu đảo nhiệt đới).
- Vật phẩm, túm và quăng người, bot trong game thật.
- Chuyển server Render sang Singapore (người dùng tự quyết, không sửa `render.yaml`).

### Tiêu chí hoàn thành
- `npm test` qua hết; `node test/bot-match.js --bonk PORT N` chơi hết một trận và in `OK`.
- Hai tab trên máy với `NET_LAG_MS=250` chơi mượt: con của mình phản hồi ngay, đánh trúng trên màn hình là đối phương văng.
- Chơi được trên máy tính, điện thoại dọc và ngang; console không lỗi.
- Hide & Seek vẫn chạy như cũ.

## 2. Luật chơi

### 2.1 Người chơi và đảo
| Số người | Số vòng ô | Số ô |
|---|---|---|
| 2–4 | 3 | 37 |
| 5–8 | 4 | 61 |
| 9–12 | 5 | 91 |

- Ô lục giác đỉnh nhọn theo trục z, bán kính ngoại tiếp `S = 1.05 m`. Toạ độ trục (q, r): `x = S·√3·(q + r/2)`, `z = S·1.5·r`. Vòng = `max(|q|, |r|, |q+r|)`.
- Mặt ô ở `y = 0`, mặt biển ở `y = -1.15`. Vòng ngoài cùng là cát, các vòng trong là cỏ.
- 2 cây dừa là vật cản (bán kính 0,38 m) trên 2 ô của vòng 2, đối diện nhau; cây rơi theo ô.
- Vị trí xuất phát: chia đều trên vòng tròn bán kính `0.6 × bán kính đảo`, quay mặt vào giữa.

### 2.2 Một trận
- Cài đặt trong sảnh: **Rounds** `3 / 5 / 7`, mặc định `5`.
- Hết các ván: podium như Hide & Seek, người tổng điểm cao nhất được tính thắng (cộng `wins` trong sảnh).

### 2.3 Một ván (đồng hồ ván `c`, `c = 0` là lúc hiện "BONK!")
1. Đếm ngược: `3`, `2`, `1`, `BONK!` (c từ -3 đến 0). Chưa ai di chuyển được.
2. Lần vỡ đầu ở `c = 15`, sau đó cứ **12 s** một lần. Mỗi lần vỡ một nửa vòng ngoài cùng còn lại (một cung liền nhau, chọn ngẫu nhiên); lần sau vỡ nửa còn lại.
3. Ô sắp vỡ nháy đỏ (`#ff4d5e`), rung và lún dần 0,12 m trong **3 s**, rồi rơi xuống biển.
4. Khi còn 7 ô (vòng 0 và 1): giữ **20 s**, rồi 6 ô vòng 1 vỡ lần lượt, mỗi ô cách **4 s** (vẫn báo đỏ 3 s), cho tới khi còn ô giữa.
5. Ván hết khi còn ≤ 1 người trên đảo và không ai đang rơi. Người còn lại hạng 1; nếu không còn ai (rơi cùng lúc) thì không có hạng 1.
6. Lịch vỡ được server tạo đầu ván và gửi một lần (mục 4.2).
7. Nghỉ giữa các ván 6 s (bảng điểm), sau ván cuối 8 s rồi podium.

### 2.4 Bị loại và chế độ ma
- Rớt xuống nước là bị loại: nước bắn, chữ `SPLASH!`, sau 0,9 s con thú bay lên đám mây ma (trong suốt 50%, ngồi trên mây ở góc trên bên phải đảo).
- Ma đi vòng ngắm tím trên đảo (7 m/s, không ra ngoài bán kính đảo) và thả **dừa**: hồi **3,5 s**. Dừa rơi từ 9 m, trọng lực 14 m/s² nên mất khoảng 1,13 s; trên đảo hiện bóng đỏ lớn dần ở chỗ dừa sắp rơi.
- Dừa chạm ô còn nguyên: mọi người trong **1,4 m** văng ra xa tâm (lực 4,8, nảy 3, choáng 0,5 s), chữ `THUNK!`. Rơi ra ngoài đảo thì chỉ bắn nước.

### 2.5 Điểm mỗi ván
- Thứ hạng = số người chưa bị loại tại lúc rớt + 1. Điểm theo hạng: `[5, 3, 2, 1]`, hạng 5 trở đi 0.
- **+1 mỗi lần hạ gục**: tính cho người đánh trúng nạn nhân gần nhất trong vòng **4 s** trước khi rớt (kể cả dừa của ma, kể cả văng dây chuyền). Tự rớt thì không ai được.

## 3. Điều khiển và vật lý (giá trị dùng chung trong `shared.js`)

### 3.1 Điều khiển
| | Máy tính | Điện thoại |
|---|---|---|
| Di chuyển | WASD / mũi tên | joystick nửa trái màn hình |
| Push | `J` | nút xanh dương |
| Bonk | giữ `K`, thả để đấm | giữ nút đỏ, thả để đấm |
| Dash | `Space` (hoặc `L`) | nút xanh lá |
| Thả dừa (ma) | `J` / `Space` | nút nâu |

Hướng nhìn = hướng đang đi (quay 14 rad/s). Mũi tên vàng dưới chân con của mình chỉ hướng nhìn.

### 3.2 Chuyển động
- Tốc độ đi 4,4 m/s; khi đang gồng Bonk 1,7 m/s. Tăng tốc về vận tốc mong muốn theo `1 - e^(-14·dt)`.
- Khi choáng: không điều khiển được, vận tốc giảm theo ma sát `e^(-4·dt)` trên đất, `e^(-0.9·dt)` khi đang bay.
- Trọng lực 24 m/s². Thân là hình tròn bán kính 0,4 m.
- Rơi: đang đứng (y = 0) hoặc vừa đáp xuống mà điểm tâm không nằm trên ô còn nguyên (ô ở trạng thái `drop` coi như mất) thì bắt đầu rơi; rơi tới `y < -1.1` là rớt nước.
- Bước mô phỏng tối đa 1/120 s để cú văng nhanh không xuyên qua vật.

### 3.3 Đòn đánh
Hướng văng = chuẩn hoá(`0.7 × hướng nhìn của người đánh + 0.3 × hướng từ người đánh tới nạn nhân`).

| Đòn | Thời gian chờ | Trúng khi | Lực văng (m/s) | Nảy (m/s) | Choáng (s) |
|---|---|---|---|---|---|
| Push | 0,45 s | nạn nhân cách ≤ 1,25 m và lệch hướng nhìn ≤ 1,15 rad | 4,6 | 1,8 | 0,3 |
| Bonk (gồng `c` 0–1, đầy sau 0,9 s) | 1,1 s | trong lúc lao (0,2 s, tốc độ `7 + 3c`), nạn nhân cách điểm 0,55 m trước mặt ≤ 0,9 m | `4.5 + 5.5c` | `2 + 2.5c` | `0.35 + 0.5c` |
| Dash | 2,2 s | lướt 0,2 s ở 10 m/s, va vào ai thì xử lý như va chạm thân | — | — | — |

- Push còn đẩy người đánh lên trước 2 m/s.
- Bonk trúng người: thời gian lao còn lại cắt xuống 0,06 s và tốc độ lao nhân 0,3 (không lao tiếp ra biển). Bonk trượt thì vẫn lao hết, có thể tự lao xuống biển.
- Bonk gồng đầy: vòng gồng dưới chân nháy đỏ-vàng, chữ `MEGA BONK!`.
- Bị đánh trúng thì huỷ gồng, huỷ lao, huỷ lướt.

### 3.4 Va chạm thân
- Hai thân chồng nhau (cao độ chênh ≤ 0,7 m) thì đẩy ra mỗi bên một nửa.
- Nếu tốc độ áp sát > 4,5 m/s (một con đang bay hoặc đang lướt tông vào): truyền `0.45 × tốc độ áp sát` theo pháp tuyến, con bị tông choáng 0,2 s và nảy 1,2 m/s. Hạ gục được tính cho con đang lướt, hoặc cho người đã đánh con đang bay.

## 4. Mạng

### 4.1 Nguyên tắc
- **Con của mình do máy mình tính** bằng `shared.js` (cùng code với server), gửi trạng thái 20 lần/giây. Server kiểm tra rồi chấp nhận hoặc kéo về.
- **Con của người khác** vẽ chậm 0,1 s so với đồng hồ server, nội suy giữa các bản chụp.
- **Thấy trúng là trúng**: máy người đánh phát hiện va chạm trên màn hình của mình và báo `hit`; server kiểm tra hợp lý rồi gửi `knock` cho máy nạn nhân, máy nạn nhân tự cho con mình văng.
- **Server là trọng tài**: lịch vỡ đảo, ai rớt, thứ hạng, điểm, dừa, cooldown.
- Đơn vị mét, làm tròn 2 chữ số khi gửi.
- Mọi tin nhắn trong ván, cả hai chiều, mang `rd` = số ván (1, 2, ...). Bên nhận bỏ tin có `rd` khác ván hiện tại. Các bảng dưới không ghi lại `rd` cho gọn.

### 4.2 Tin nhắn (đều nằm trong `{t:'g', d}` của core)
Máy → server:
| `d` | Khi nào |
|---|---|
| `{t:'st', x, z, y, vx, vz, vy, f, fl, ch}` | 20 Hz khi còn trên đảo. `f` hướng nhìn (rad), `ch` mức gồng 0–1, `fl` bit: 1 gồng, 2 choáng, 4 lao, 8 lướt, 16 đang bay, 32 đang rơi |
| `{t:'act', a, q, c}` | lúc bắt đầu đòn: `a` = `push` / `bonk` / `dash`, `q` số thứ tự đòn của mình trong ván, `c` mức gồng (bonk) |
| `{t:'hit', id, a, q, c, dx, dz}` | đòn số `q` chạm người `id` trên màn hình mình; `dx, dz` hướng văng |
| `{t:'fall'}` | con của mình bắt đầu rơi |
| `{t:'nut', x, z}` | ma thả dừa |

Server → máy:
| `d` | Gửi cho |
|---|---|
| `{t:'round', rd, of, rings, palms, breaks, spawn, c}` | mọi người, đầu ván và khi vào lại. `breaks`: `[[q, r, warnAt, dropAt], ...]` theo đồng hồ ván; `spawn`: `{id: [x, z, f]}` |
| `{t:'s', c, ph, p, nuts}` | mọi người, 20 Hz. `p`: `[[id, x, z, y, f, fl, ch, ghost], ...]`; `nuts`: `[[x, z, landAt], ...]` |
| `{t:'knock', vx, vz, vy, stun, by, a}` | chỉ nạn nhân |
| `{t:'fx', a, id, x, z, c}` | mọi người: hiệu ứng `push` / `bonk` / `dash` / `thunk` / `splash` |
| `{t:'fix', x, z, y, vx, vz, vy}` | chủ con thú khi trạng thái gửi lên bị từ chối |
| `{t:'out', id, by, a, place}` | mọi người, khi có người rớt nước |
| `{t:'roundEnd', rows, win}` | mọi người; `rows`: `[{id, place, ko, got, total}]` |
| `{t:'final', rows}` | mọi người; `rows`: `[{id, total, rank}]`, rồi podium và `api.end(winnerIds)` |

### 4.3 Server kiểm tra
- **`st`**: bỏ qua khi đang rơi hoặc đã bị loại. Quãng di chuyển từ lần nhận trước phải ≤ `max(10, tốc độ knock gần nhất) × dt × 1.5 + 0.5`, nếu không thì gửi `fix` với trạng thái server đang giữ.
- **`act`**: đòn đó phải hết thời gian chờ (cho dư 0,1 s), người đánh không choáng, không rơi. Ghi lại thời điểm và số `q`; phát `fx` cho người khác.
- **`hit`**: phải có `act` cùng loại, cùng `q`, trong 0,4 s trước đó; mỗi đòn trúng một người tối đa một lần; nạn nhân còn trên đảo. Tầm: trong 0,4 s vừa qua có lúc nạn nhân cách vị trí người đánh ≤ tầm của đòn + 0,6 m (Push 1,25; Bonk 1,45; Dash 0,8). Lực tính lại trên server theo bảng 3.3 (`c` kẹp 0–1); hướng `dx, dz` được chuẩn hoá.
- Server giữ lịch sử vị trí 0,5 s của mỗi người để kiểm tra tầm.
- **Va chạm dây chuyền**: mỗi tick server xét các cặp; nếu một con đang bay (choáng + y > 0) hoặc đang lướt chồng lên con khác với tốc độ áp sát > 4,5, gửi `knock` cho con kia (mỗi cặp tối đa một lần mỗi 0,3 s).
- **Rơi**: nhận `fall`, hoặc vị trí server giữ nằm ngoài ô còn nguyên quá 0,5 s khi y ≤ 0, thì đánh dấu đang rơi; 0,6 s sau tính là rớt nước (`out`).
- **`nut`**: chỉ ma, hết thời gian chờ 3,5 s, điểm thả trong bán kính đảo + 1 m.

### 4.4 Người rớt mạng, thoát, vào lại
- Rớt mạng (`onDisconnect`): con thú ở lại, server tự mô phỏng bằng `shared.js` với điều khiển bằng 0; `knock` áp thẳng vào con đó, rơi thì xử lý như thường.
- Vào lại (`onRejoin`): gửi lại `round` và trạng thái hiện tại của con mình; máy tiếp tục điều khiển từ đó.
- Thoát hẳn (`onLeave`): nếu còn trên đảo thì tính là rớt (công hạ gục vẫn theo quy tắc 4 s). Còn dưới 2 người trong phòng: đang ở ván cuối thì chốt kết quả, không thì `end([])`.
- Phòng đang chơi không nhận người mới (core đã chặn).

### 4.5 Công tắc test
- `BK_FAST=1`: đếm ngược 1 s, vỡ đầu ở 3 s, mỗi 3 s, báo đỏ 1 s, giữ 3 s, vỡ lẻ mỗi 1 s, nghỉ giữa ván 2 s.
- `NET_LAG_MS=250` (trong `server/core.js`, chỉ để test): trễ mỗi chiều `NET_LAG_MS / 2` cho mọi tin nhắn của mọi game. Không đặt thì không đổi gì.

## 5. Phía trình duyệt

### 5.1 File
| File | Việc |
|---|---|
| `public/games/bonk3d/shared.js` | UMD như `core3d/animals.js`: hằng số mục 3, `step(body, input, dt, isGround)`, toạ độ lục giác, `pushHits`, `bonkReach`, `hitDir`, `collide` |
| `client.js` | `mount / unmount / onMsg / onEmote`; vòng lặp con của mình, gửi `st` 20 Hz, áp `knock` và `fix`, nội suy người khác, đồng hồ ván theo `c` trong bản chụp |
| `world.js` | đảo (ô cột lục giác, viền bọt), biển gợn sóng low-poly, đảo nhỏ phía xa, mây, đám mây ma, trạng thái ô theo lịch vỡ |
| `fighters.js` | con thú (`assets.pet`), nghiêng khi gồng, lộn nhào khi bay, sao choáng, vòng gồng, bóng, thẻ tên, mũi tên hướng, chuyển sang ma |
| `fx.js` | nước bắn, sao, bụi, chữ nổi (`BONK!`, `MEGA BONK!`, `Push!`, `THUNK!`, `SPLASH!`), rung camera, khựng 60 ms khi mình đánh trúng |
| `hud.js`, `hud.css` | xem 5.2 |
| `overlays.js` | đếm ngược, bảng điểm ván, podium cuối trận |

Camera: khung vừa phần đảo còn lại, nghiêng 25% về phía trung bình những người còn sống, góc nhìn khoảng 53° từ phía nam; rung theo mức gồng khi Bonk trúng. Bóng đổ tắt trên điện thoại như Hide & Seek.

### 5.2 Màn hình chơi (như mockup)
- Trên giữa: `ROUND n / N`, đồng hồ vỡ (`Edge breaks in 0:08`, đỏ rung `Edge is cracking!` khi đang báo, `Last stand!` khi chỉ còn ô giữa), `ALIVE x / y`.
- Trái: danh sách người chơi (chấm màu, tên, `n KO`; bị loại thì mờ và gạch tên). Điện thoại dọc: chỉ chấm màu.
- Giữa trên: thông báo kiểu `Mai bonked Bao into the sea!`, `Your coconut got Vy!`, `Tuan slipped off the edge!`, `The edge is cracking!`.
- Phải dưới: Push (xanh dương), Dash (xanh lá), Bonk (đỏ, có vòng gồng); vòng tối quét khi đang chờ. Ma: chỉ nút Coconut (nâu) và thanh tím `You're a ghost! Drop coconuts on the others`.
- Máy tính: gợi ý phím ở trái dưới. Điện thoại: joystick. Màn hình thấp (≤ 500 px, điện thoại ngang): thu nhỏ mọi thứ như mockup.
- Nút emote như các game khác; điện thoại rung khi bị đánh (chỉ sau khi đã chạm màn hình).
- Âm thanh tổng hợp bằng `sfx` (không file âm thanh); khi có người rớt nước phát `sfx.animal` của con đó.

### 5.3 Gắn vào app
- `server/index.js`: thêm `bonk: require('./games/bonk')`.
- `public/app.js`: `GAMES.bonk`; `public/index.html`: link `games/bonk3d/hud.css` và `<script src="games/bonk3d/shared.js">`.
- `public/core3d/screens/lobby.js`: `ART.bonk` (đảo lục giác nhỏ có 2 con thú và ngôi sao), `GAME_COL.bonk = '#4fb4ff'`.
- `public/core3d/screens/open.js`: thêm Bonk Island vào How to Play.
- `meta`: `{ id: 'bonk', name: 'Bonk Island', desc: 'Shove your friends into the sea. Last paw standing wins!', min: 2, max: 12, tag: 'Brawl', settings: [rounds] }`.
- README: thêm mục Bonk Island và cấu trúc thư mục.

## 6. Trường hợp biên
- Tin nhắn của ván cũ đến muộn: tin có `rd` khác ván hiện tại thì bỏ, ở cả máy lẫn server.
- Hai người đấm nhau cùng lúc: cả hai cùng văng.
- `knock` đến khi con mình đang rơi hoặc đã là ma: bỏ qua.
- Đồng hồ máy lệch: đồng hồ ván lấy theo `c` của bản chụp mới nhất cộng thời gian trôi qua, làm mượt.
- Tab bị ẩn (rAF dừng): khi quay lại, lấy trạng thái từ server (`fix` nếu lệch xa); camera bỏ qua khung khi cửa sổ rộng 0.
- Số liệu lạ từ máy gửi lên (NaN, quá lớn): kẹp lại hoặc bỏ.

## 7. Kiểm tra
- `test/bonk-shared.test.js`: quãng văng Push khoảng 1–2 m, Bonk đầy khoảng 4–6 m; Bonk trượt ở mép tự lao xuống biển; phát hiện rơi; `xzToHex` đúng với mọi ô.
- `test/bonk-island.test.js`: số ô theo số người (37 / 61 / 91); lịch vỡ luôn dừng ở 1 ô; thời điểm đúng (15, 27, ...; giữ 20 s; mỗi 4 s); vỡ nửa vòng là một cung liền.
- `test/bonk.test.js` (server với api giả như `hideseek.test.js`): nhận `hit` hợp lý, từ chối khi xa quá, chưa hết thời gian chờ, không có `act`, trúng hai lần một đòn; `fix` khi nhảy vị trí; công hạ gục trong 4 s (kể cả dừa và dây chuyền); bảng điểm; rớt mạng vẫn bị đẩy; thoát giữa ván tính là rớt; dưới 2 người thì kết thúc; vào lại nhận `round`; `final` gọi `end` với người thắng.
- `test/bot-match.js --bonk PORT N` (2–6 bot, `BK_FAST=1`, Rounds 3): bot tự mô phỏng bằng `shared.js`, đi về người gần nhất, gửi `act` / `hit` khi trong tầm, báo `fall`, khi là ma thì thả dừa; in kết quả và `OK`.
- Trình duyệt: máy tính, điện thoại dọc và ngang; hai tab đấu nhau với `NET_LAG_MS=250`.

## 8. Thứ tự làm (chi tiết trong kế hoạch)
1. `shared.js` và test vật lý.
2. `island.js` và test lịch vỡ.
3. Server `bonk/index.js` và test luật, mạng.
4. `NET_LAG_MS` trong core, chế độ `--bonk` của bot-match.
5. Client: thế giới, con thú, hiệu ứng.
6. Client: mạng (tự tính con mình, nội suy, knock, fix).
7. HUD, đếm ngược, bảng điểm, podium.
8. Gắn vào app (sảnh, How to Play, README).
9. Kiểm tra trên trình duyệt, chỉnh cảm giác đánh với độ trễ 0,25 s.
