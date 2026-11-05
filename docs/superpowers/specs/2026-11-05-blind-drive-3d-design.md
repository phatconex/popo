# Pawty 3D — Blind Drive (đua đội lái xe mù)

Ngày: 2026-11-05 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Làm game thứ hai của Pawty bằng 3D: **Blind Drive**.
Mỗi đội có một người lái gần như không thấy gì và một (hoặc hai) người dẫn đường thấy toàn bộ con đường.
Các đội đua cùng lúc trên cùng một con đường, đón thú, nhặt xu, về đích để lấy điểm.

Luồng màn hình dùng lại của Pawty: Open → Lobby (chọn đội) → Get Ready → Playing → Level results → … → Final podium → Lobby.

Đã chốt qua mockup: `drive3d.html` (thư mục mockup tạm của phiên làm việc).
Mockup đó là tài liệu tham khảo về hình ảnh và bố cục. Code thật viết lại theo spec này, không chép nguyên mockup.

### Không làm trong đợt này
- Critter Badminton: vẫn ẩn, giữ nguyên.
- Không có bot làm đồng đội. Không có va chạm giữa xe các đội.
- Không lưu điểm lâu dài, không nhạc nền (chỉ âm thanh ngắn bằng WebAudio như Hide & Seek).
- Không đổi luật Hide & Seek. Thay đổi phần chung (`core.js`, `lobby.js`) không được làm khác hành vi Hide & Seek.

### Tiêu chí hoàn thành
1. Thử hai cấu hình, mỗi cấu hình có ít nhất một máy tính và một điện thoại (người còn lại là bot hoặc tab khác): **4 người = 2 đội 2 người** và **3 người = 1 đội 3 người**. Tạo phòng, chọn đội, đua hết số màn, lên bục vinh danh, quay về Lobby, không lỗi console.
2. Người lái rớt mạng giữa màn: đồng đội lên thay lái sau 5 giây. Vào lại phòng được.
3. Hide & Seek vẫn chơi được như trước (bot-match và test cũ vẫn đạt).
4. Mọi chữ hiển thị là tiếng Anh, font Lilita One, không emoji.
5. Chạy trên Render như cũ: không bước build, chỉ `npm start`.

## 2. Luật chơi

### 2.1 Phòng và đội
- 2–8 người mỗi phòng (`meta.min = 2`, `meta.max = 8`).
- Lobby có 4 ô đội: **Red, Blue, Green, Yellow** (màu `#ff5d6c`, `#4fb4ff`, `#55d36b`, `#ffc727`). Người chơi bấm một ô để vào đội đó; bấm lại để ra. Mỗi đội tối đa 3 người.
- Khi chủ phòng bấm Start, server sắp đội cuối cùng (hàm `balance`, mục 4.3):
  - Người chưa chọn đội được xếp vào đội đang ít người nhất (ưu tiên đội đã có 1 người, rồi đội trống).
  - Đội chỉ có 1 người: người đó được chuyển sang một đội 2 người khác (thành đội 3), hoặc ghép với một người lẻ khác thành đội 2.
  - Kết quả: mọi đội có 2 hoặc 3 người, có ít nhất 1 đội.
- Đội 3 người: 1 lái + 2 dẫn đường, cả hai dẫn đường đều gửi lệnh được.
- Vai xoay vòng mỗi màn: thành viên đội xếp theo thứ tự vào đội, người lái ở màn `L` là `members[L % size]`.

### 2.2 Một màn
1. **Get Ready** (3 giây): tên map, "Level 2 / 4", từng đội và ai lái / ai dẫn đường.
2. **Đếm ngược 3–2–1–GO**, xe đứng yên.
3. **Đua**: mọi đội chạy cùng một con đường, cùng lúc.
   - Xe các đội khác là **xe ma**: xuyên qua nhau, không đẩy nhau.
   - Người dẫn đường thấy xe mọi đội (xe đội khác mờ 50%, có cờ màu đội). Người lái chỉ thấy xe đội mình.
4. Khi **đội đầu tiên về đích**, các đội còn lại có **20 giây**. Màn kết thúc khi mọi đội đã về đích hoặc hết 20 giây.
   - Giới hạn an toàn: màn tự kết thúc sau 4 phút kể cả khi chưa đội nào về đích.
5. **Level results** (7 giây), rồi sang màn sau. Hết màn cuối là **Final podium** (12 giây) rồi về Lobby.

### 2.3 Trên đường
Mọi thứ trong mục này được tính **riêng cho từng đội** (đội A đón khách ở trạm 1 thì đội B vẫn đón được khách ở trạm 1).

- **Trạm đón khách** (3 trạm mỗi màn; từ màn thứ 3 trở đi là 4): một con thú đứng bên đường cạnh biển báo, có vòng hồng trên mép đường.
  Xe dừng trong vòng (cách tâm vòng ≤ 2,2 m, tốc độ ≤ 1,2 m/s) đủ 0,8 giây thì thú lên xe (+100). Rời vòng giữa chừng thì thanh tiến độ tụt dần, không mất hết.
- **Xu**: các hàng 5 xu nằm trên đường. Xe đi qua (cách ≤ 0,9 m) thì nhặt (+10).
- **Vũng trơn**: hình elip trên đường. Trong vũng thì xe mất độ bám (trượt), tay lái kém hơn.
- **Thú băng qua đường** (2 chỗ mỗi màn): đi qua lại theo chu kỳ, nghỉ 1,5 giây mỗi bên. Vị trí là hàm của thời gian, server và trình duyệt tính giống nhau.
- **Đồi dốc**: lên dốc xe chậm lại, nhả ga giữa dốc thì xe trôi ngược; xuống dốc xe tự nhanh dần.
- **Cổng đích**: đi qua vạch đích là về đích.

### 2.4 Tông xe (spin-out)
Xe bị **spin-out** khi:
- chạm thú băng qua đường (khoảng cách tâm ≤ 0,9 m và tốc độ > 0,5 m/s), hoặc
- ra quá xa đường: cách đường tâm > **6 m**.

Spin-out: xe xoay 1 vòng và đứng yên **2 giây**, rồi được đặt lại lên điểm gần nhất trên đường tâm, quay đúng hướng đường, tốc độ 0. Sau đó miễn spin-out 1,3 giây.
Không có tim, không đội nào bị loại.

Dải từ mép đường (1,9 m) đến 6 m là **bãi cỏ**: xe chạy được nhưng tốc độ tối đa thấp (mục 2.6), rung nhẹ. Trong dải này **không có vật cứng**, chỉ có hoa và cỏ thấp (mục 3.4).

### 2.5 Tính điểm
Mỗi màn, mỗi đội:
- Thứ tự về đích: hạng 1 **300**, hạng 2 **200**, hạng 3 **120**, hạng 4 **60**. Không về đích kịp: 0.
- Mỗi khách đón được: **100**. Mỗi xu: **10**.

Tổng điểm cộng dồn qua các màn. Bục vinh danh xếp theo tổng điểm đội; bằng điểm thì đội có nhiều lần hạng 1 hơn đứng trên, vẫn bằng thì đồng hạng.
`api.end(winnerIds)` nhận danh sách người chơi của đội đứng đầu (số trận thắng `wins` của từng người tăng như Hide & Seek).

### 2.6 Xe và điều khiển
Đơn vị trong game này là **mét** (1 mét = 1 đơn vị three.js). Hằng số khởi điểm, chỉnh khi chơi thử:

| Hằng số | Giá trị |
|---|---|
| Tốc độ tối đa trên đường | 7 m/s |
| Tốc độ tối đa trên cỏ | 3,2 m/s |
| Tốc độ lùi tối đa | 2,5 m/s |
| Tăng tốc (ga) | 4,5 m/s² |
| Phanh | 10 m/s² |
| Ma sát khi nhả ga | giảm 45% tốc độ mỗi giây (trơn: 20%) |
| Tốc độ quay đầu | 2,2 rad/s, nhân với min(1, \|v\|/2,5), đổi chiều khi lùi |
| Độ bám ngang | 9 (trơn: 1,2; trên băng ở map tuyết: 0,7) |
| Ảnh hưởng dốc | gia tốc thêm −6 × độ dốc (m/s²) theo hướng xe |

Điều khiển người lái:
- Máy tính: **A/D** hoặc mũi tên trái/phải để rẽ, **W** hoặc mũi tên lên là ga, **S** hoặc mũi tên xuống là phanh, **R** là lùi.
- Điện thoại: 2 nút rẽ bên trái, 3 nút Reverse / Brake / Gas bên phải (như mockup).

Lệnh của người dẫn đường (8 lệnh, phím tắt trên máy tính):

| Lệnh | Chữ to bên người lái | Phím | Màu |
|---|---|---|---|
| Left | TURN LEFT! | A | `#4fb4ff` |
| Right | TURN RIGHT! | D | `#4fb4ff` |
| Straight | STRAIGHT ON | W | `#55d36b` |
| Faster | FASTER! | E | `#7cc93f` |
| Slow | SLOW DOWN | Q | `#ffb81f` |
| Stop | STOP! | S | `#ff5d6c` |
| Reverse | BACK UP | R | `#9a7cff` |
| Pick up | PICK UP HERE | Space | `#ff7fc8` |

Mỗi người dẫn đường gửi tối đa 1 lệnh mỗi 0,15 giây. Lệnh tới người lái sau **độ trễ** trong cài đặt phòng.

### 2.7 Cài đặt phòng
- **Map**: Random, Country Road, Snowy Pass, Beach Town, Night City (mặc định Random; Random không lặp map của màn trước).
- **Levels**: 2, 4, 6 (mặc định 4).
- **Signal delay**: None, 0.5 s, 1 s (mặc định None).

## 3. Đường đua và cảnh

### 3.1 Sinh đường (server)
- Đường tâm là chuỗi điểm cách nhau 2 m. Hướng đi luôn lệch không quá ±75° so với "đi thẳng tới", đổi dần theo từng đoạn cua (cách của Lái Mò cũ) nên **không bao giờ tự cắt nhau**.
- Độ dài: 180 m ở màn 1, +30 m mỗi màn, tối đa 330 m.
- Nửa bề rộng đường: 1,9 m ở màn 1, giảm 0,08 m mỗi màn, tối thiểu 1,5 m. Lề cát rộng thêm 0,6 m mỗi bên.
- Đoạn 12 m đầu luôn thẳng và phẳng (chỗ xuất phát). Đoạn 10 m cuối thẳng (cổng đích).
- **Đồi**: các bướu tròn (hàm Gauss) đặt trên đường tâm. Chiều cao `H(x, z)` là tổng các bướu, dùng chung cho server và trình duyệt.
  Số đồi và độ cao theo map: Country 3–4 đồi cao 3–4,5 m; Snowy 4–5 đồi cao 3,5–5 m; Beach 1–2 đồi cao 1,5–2,5 m; Night 0–1 đồi cao ≤ 2 m. Độ dốc dọc đường không quá 0,22.
- Trạm, xu, vũng trơn, chỗ thú băng qua được đặt cách nhau đủ xa, không chồng lên nhau, không nằm trong 12 m đầu và 10 m cuối.
- Mỗi màn có một **seed** ngẫu nhiên. Dữ liệu đường gửi cho mọi người trong tin `init`.

### 3.2 Bốn map

| Map | Nền / đường | Thú băng qua | Khách | Đặc trưng |
|---|---|---|---|---|
| Country Road | cỏ xanh, đường xám tím, lề cát | cow, pig | bunny, chick, pig, dog, cat | ruộng, ao, cối xay, lều trại, chợ nhỏ |
| Snowy Pass | tuyết trắng, đường xám xanh | penguin, polar | penguin, deer, fox, beaver | thông phủ tuyết, người tuyết, nhà gỗ, xe trượt; vũng trơn thành mảng băng, nhiều hơn |
| Beach Town | cát vàng, biển một bên | crab, parrot | crab, monkey, koala, parrot | dừa, thuyền, thùng hàng, tháp canh, cờ |
| Night City | cỏ tối, trời xanh đậm | cat, dog | dog, cat, panda, tiger | đèn đường sáng, sạp chợ, đài phun nước; xe bật đèn pha |

Mã thú lấy từ bảng 24 thú dùng chung (`public/core3d/animals.js`).

### 3.3 Mô hình 3D
Chỉ dùng các gói Kenney đã có trong `public/assets/kenney/` (nature, platformer, holiday, pirate, survival, town, pets). Không tải thêm gói mới.
Xe tự dựng bằng khối bo tròn (`RoundedBoxGeometry`) như mockup, màu theo đội.

Sửa lỗi phát hiện trong mockup: nhiều vật liệu Kenney nạp vào với `metalness = 1` (mặc định của glTF) nên mặt khuất nắng bị đen.
Game này đặt `metalness = 0` cho mọi vật liệu khi nạp mô hình (trong `assets.js`, áp dụng chung). Việc này cũng làm cây của Hide & Seek sáng hơn; sau khi sửa phải xem lại Hide & Seek, nếu quá sáng thì giảm mức `brighten` của nó.

### 3.4 Bày cảnh (trình duyệt, theo seed)
Hàm `layout(track, theme, seed)` trả về danh sách vật `{kind, x, z, rot, scale}`. Cùng seed thì mọi máy ra cùng kết quả. Server không cần biết cảnh.

Quy tắc khoảng cách (đo từ đường tâm, tính theo **toàn bộ kích thước** của vật hoặc cụm vật, không chỉ tâm):
- Dải 0–2,5 m (đường + lề): không có gì ngoài các vật của luật chơi (xu, vũng, vòng trạm, thú băng qua, cổng đích).
- Dải 2,5–6 m (bãi cỏ): chỉ hoa, cỏ, nấm, đá cuội nhỏ (cao ≤ 0,6 m, không cản xe), và biển báo + thú của trạm đón.
- Từ 6,3 m: hàng rào ven đường, đèn đường.
- Từ 6,5 m (tính cả bán kính vật): cây to, bụi lớn, đá lớn, và các cụm cảnh: ruộng, ao, khu cắm trại, sạp chợ, cối xay, nhà.

Mật độ: dày nhất trong dải 6,5–14 m (vùng camera người dẫn đường nhìn thấy), thưa dần ra xa. Không chồng lên nhau.

## 4. Thay đổi phía server

### 4.1 `server/core.js`
- `profile` nhận thêm `team` (0–3, hoặc −1 để ra khỏi đội). Chỉ có tác dụng khi game đang chọn có `meta.teams`; giới hạn `meta.teams.max` người mỗi đội (3).
- `lobbyMsg` thêm `team` cho mỗi người chơi (mặc định −1).
- Đổi game trong Lobby thì xoá đội của mọi người.
- `start`: ngoài kiểm tra `meta.min`, kiểm tra thêm `meta.max` — quá thì báo `Max ${max} players for this game`.
- Sau khi game kết thúc (`api.end`) giữ nguyên đội để chơi lại nhanh.

### 4.2 `server/index.js`
- `GAMES = { hideseek, blinddrive }`.
- Xoá Lái Mò 2D cũ: `server/games/drive/` và `public/games/drive/`. Sửa dòng ghi chú về game tạm dừng.

### 4.3 `server/games/blinddrive/`
- `index.js` — module game `{ meta, create(api) }`:
  - `meta`: `id: 'blinddrive'`, `name: 'Blind Drive'`, `desc: 'One drives blind, one calls the turns'`, `tag: '2-8 players · teams'`, `min: 2`, `max: 8`, `teams: { count: 4, max: 3, names: ['Red','Blue','Green','Yellow'] }`, `settings` theo mục 2.7.
  - Pha: `ready` (Get Ready 3 s) → `count` (3 s) → `race` → `result` (7 s) → màn sau hoặc `final` (12 s) → `api.end`.
  - Mỗi tick (20 lần/giây): cập nhật thú băng qua, kiểm tra spin-out, trạm, xu, vạch đích của từng đội từ vị trí xe mới nhất; gửi snapshot.
  - Hàm thuần, xuất ra cho test qua `_test`: `balance(players)`, `score(levelResult)`, `rank(totals)`, `validateMove(prev, next, dt)`.
- `track.js` — `genTrack(theme, level, seed)` → dữ liệu đường (mục 3.1), không phụ thuộc trình duyệt.

### 4.4 Code dùng chung server + trình duyệt
`public/games/blinddrive3d/shared.js` (dạng UMD giống `animals.js`: trình duyệt dùng `window.BD`, server dùng `require`):
- `rng(seed)` — bộ sinh số ngẫu nhiên có seed (mulberry32).
- `heightAt(hills, x, z)`, `slopeAlong(hills, x, z, heading)`.
- `CAR` (hằng số mục 2.6) và `stepCar(car, input, env, dt)` — một bước vật lý xe; `env` gồm độ cao, trơn hay không, trên đường hay trên cỏ.
- `crosserPos(crosser, t)` — vị trí thú băng qua theo thời gian.
- `nearestOnTrack(track, x, z)` → `{i, dist, side}`.
- `layout(track, theme, seed)` (mục 3.4) — đặt ở đây để test được bằng Node.

### 4.5 Tin nhắn
Trình duyệt → server (bọc trong `{t:'g', d}` như Hide & Seek):
- Người lái, 20 lần/giây: `{t:'car', x, z, a, v, st, g, b, r}` — vị trí, hướng, tốc độ, và phím đang bấm (để người dẫn đường thấy xe đang ga/phanh).
- Người dẫn đường: `{t:'sig', k}` (0–7).

Server → trình duyệt:
- `init`: `{track, theme, level, levels, teams:[{id, name, members, driver}], me:{team, role}, ph, t0}`.
- `s` (snapshot 20 lần/giây): `{ph, tm, cars:[[team, x, z, a, v, flags]], tp:[[team, picked, coins, finishPlace]], cr:[[i, x, z]]}`. `flags`: bit 1 spin-out, bit 2 đang ga, bit 4 đang phanh, bit 8 trên cỏ.
- `sig`: `{k, from}` — chỉ gửi cho người lái của đội đó, sau độ trễ.
- `sent`: `{k}` — xác nhận cho người dẫn đường.
- `fx`: `{kind: 'pick'|'coin'|'spin'|'finish', team, i?}`.
- `fix`: `{x, z, a, v}` — server buộc xe về vị trí này (spin-out đặt lại, hoặc vị trí gửi lên bị từ chối).
- `level`: kết quả màn; `final`: bảng tổng.

### 4.6 Xe do máy người lái tính
- Máy người lái chạy `stepCar` 60 lần/giây và gửi vị trí lên.
- Server nhận vị trí qua `validateMove`: quãng đường từ lần gửi trước không quá `7 m/s × dt × 1,5 + 0,5 m`; nếu vượt, server bỏ vị trí đó và gửi `fix` với vị trí cũ.
- Khi spin-out, server gửi `fix` và bỏ qua mọi vị trí gửi lên trong 2 giây.
- Người dẫn đường và đội khác thấy xe qua snapshot, nội suy trễ 110 ms như Hide & Seek.

## 5. Phía trình duyệt

Thư mục `public/games/blinddrive3d/`:
- `client.js` — `mount/unmount/onMsg/onLobby/onEmote` giống Hide & Seek; vòng lặp khung hình; chọn camera theo vai.
- `world.js` — địa hình có đồi (lưới cỏ theo `heightAt`, tô màu sáng dần lên đỉnh), dải đường, lề, vạch giữa, cổng đích, vũng, vòng trạm; bày cảnh từ `layout` (dùng `InstancedMesh` cho vật lặp lại nhiều như Hide & Seek).
- `car.js` — dựng xe theo màu đội, bánh xe quay, nghiêng theo dốc, thú lái và thú khách ngồi trên xe; vật liệu xe và thú trên xe không bị sương che (`fog = false`).
- `hud.js` + `hud.css` — HUD người dẫn đường và người lái như mockup:
  - Chung: thanh tiến độ (mọi đội trên cùng một thanh, chấm màu đội), số khách, số xu.
  - Người dẫn đường: chip vai, "Calling to *tên*", 8 nút lệnh.
  - Người lái: thẻ lệnh to + 3 lệnh trước, đồng hồ tốc độ, "Something nearby?" (gần thú băng qua, vũng trơn hoặc mép cỏ phía trước), "Road feels" (Flat / Uphill / Downhill / Slippery / Off road!), nút lái.
- `overlays.js` — Get Ready, đếm ngược, banner "1st!/2nd!…" khi về đích, Level results theo đội, Final podium theo đội (thú của các thành viên đứng trên bục).
- `ambient.js` — bướm (Country), tuyết rơi (Snowy), lấp lánh trên biển (Beach), đom đóm (Night).

Camera:
- Người dẫn đường: sau xe đội mình 10 m, cao 9,5 m, nhìn trước xe 4,5 m.
- Người lái: sau xe 4,6 m, cao 2,7 m; sương `Fog(near 1,2, far 5,4)` cùng màu nền, kính mờ bằng `backdrop-filter`. Chỉ thấy xe mình.

Âm thanh (WebAudio, không file):
- Tiếng máy: cao độ theo tốc độ, chỉ phát ở máy người lái.
- Mỗi lệnh có một nốt riêng.
- Tiếng rung khi chạy trên cỏ, tiếng "bụp" khi spin-out, tiếng ting khi nhặt xu, tiếng thú khi khách lên xe (dùng `sfx.animal`).
- Điện thoại rung khi spin-out.

Lobby (`public/core3d/screens/lobby.js`):
- Khi game có `meta.teams`: hiện 4 cột đội, mỗi cột có nút "Join", tên và thú của thành viên, tối đa 3 ô. Bệ đứng của người chơi tô theo màu đội; chưa vào đội thì màu xám.
- Game không có `meta.teams` (Hide & Seek): giữ nguyên như hiện tại.

`public/app.js`: `GAMES = { hideseek: HideSeek, blinddrive: BlindDrive }`.

## 6. Lỗi và trường hợp biên
- **Người lái rớt mạng**: xe tự phanh dần về 0. Sau 5 giây nếu chưa vào lại và đội còn người đang kết nối thì người đó thành người lái cho hết màn. Người cũ vào lại thì làm dẫn đường đến hết màn; màn sau xoay vai bình thường.
- **Cả đội rớt mạng**: xe đứng yên, đội vẫn được tính điểm đã có; không về đích thì không có thưởng về đích.
- **Người rời hẳn** (`onLeave`): bỏ khỏi đội.
  - Đội còn 2–3 người: chơi tiếp, vai xoay vòng trong số người còn lại.
  - Đội còn 1 người: người đó lái **và được thấy đường như người dẫn đường** cho hết trận (chế độ "solo"; HUD người lái nhưng camera và cảnh của người dẫn đường). Không ghép sang đội khác giữa trận để không làm rối điểm.
  - Đội hết người: bỏ khỏi bảng.
- Dưới 2 người kết nối trong phòng: kết thúc trận như Hide & Seek.
- Vào lại phòng (`onRejoin`): gửi lại `init` của màn hiện tại và snapshot mới nhất.
- Tin nhắn sai dạng hoặc từ sai vai (người dẫn đường gửi `car`, người lái gửi `sig`) thì bỏ qua.

## 7. Kiểm tra
- Test tự động (`node:test`), file mới `test/blinddrive.test.js`:
  - `genTrack`: 200 seed × 4 map × màn 0–5 — đường không tự cắt nhau; độ dốc dọc ≤ 0,22; trạm/xu/vũng/thú không chồng nhau và nằm đúng khoảng.
  - `layout`: với các seed trên, không vật nào vi phạm quy tắc khoảng cách mục 3.4 (tính theo bán kính vật).
  - `balance`: các trường hợp 2–8 người, có/không chọn đội trước, có người lẻ — mọi đội 2–3 người.
  - `score` / `rank`: đúng bảng điểm mục 2.5, xử lý đồng hạng.
  - `stepCar`: lên dốc chậm hơn đường phẳng, xuống dốc nhanh hơn; trên cỏ không vượt 3,2 m/s; cùng đầu vào ra cùng kết quả.
  - `validateMove`: từ chối bước nhảy quá xa.
  - `core`: chọn đội, giới hạn 3 người/đội, `meta.max`, đổi game xoá đội.
- Bot: thêm chế độ lái vào `test/bot-match.js` (`--drive`) — bot người lái chạy `stepCar` bám đường tâm, bot dẫn đường gửi lệnh ngẫu nhiên; chạy hết một trận 2 màn với 4 bot và với 3 bot.
- Trình duyệt: chơi thật với bot trên cả 4 map, cả hai vai; thử rớt mạng giữa màn; xem Lobby chọn đội; khổ điện thoại; kiểm tra Hide & Seek sau khi đổi `metalness`.

## 8. Thứ tự làm (sẽ chi tiết trong kế hoạch)
1. `shared.js` (rng, độ cao, vật lý xe, thú băng qua) + test.
2. `track.js` + test.
3. Core: đội trong Lobby, `meta.max` + test; Lobby hiện cột đội.
4. Module game `blinddrive` (pha, đội, spin-out, trạm, xu, đích, điểm, rớt mạng) + test + bot.
5. Trình duyệt: world + car + camera hai vai.
6. HUD hai vai + điều khiển + âm thanh.
7. Overlays: Get Ready, đếm ngược, kết quả, bục vinh danh.
8. `layout` + 4 map cảnh + test khoảng cách.
9. Sửa `metalness` chung, xem lại Hide & Seek; xoá Lái Mò 2D; README.
