# Popo 3D — Hide & Seek hoàn chỉnh + vỏ ứng dụng mới

Ngày: 2026-11-04 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Chuyển Popo sang giao diện 3D bằng three.js, tiếng Anh là ngôn ngữ chính, phong cách party game hoạt hình.
Đợt này làm **trọn vẹn một game: Hide & Seek**, cùng toàn bộ luồng màn hình bao quanh nó:

Open → (nhập tên / mã phòng) → Lobby → Get Ready → Playing → Round results → … → Final results → Lobby

Đã chốt qua mockup (thư mục mockup tạm): `open.html`, `lobby3d.html`, `intro.html`, `hs3d.html`.

### Không làm trong đợt này
- Blind Drive (Lái Mò) và Critter Badminton (Cầu Lông Thú): **ẩn khỏi danh sách game**, giữ nguyên code 2D để chuyển sau.
- Không đổi luật chơi Hide & Seek. Chỉ đổi hiển thị, ngôn ngữ, và các chỗ server bắt buộc phải sửa (mục 4).
- Không thêm tài khoản, không lưu điểm lâu dài, không thêm nhạc nền (chỉ giữ tiếng bíp/hiệu ứng ngắn bằng WebAudio như hiện tại).

### Tiêu chí hoàn thành
1. Hai người ở hai máy (một máy tính, một điện thoại) tạo phòng, vào phòng, chọn thú, chơi hết các ván Hide & Seek và quay về Lobby mà không lỗi console.
2. Rớt mạng giữa ván rồi vào lại được (như hiện tại).
3. Mọi chữ hiển thị là tiếng Anh, font Lilita One.
4. Chạy được trên Render như cũ: không cần bước build, chỉ `npm start`.

## 2. Phong cách và tài nguyên

### Font và màu
- Font: **Lilita One** (Google Fonts, OFL). Không có dấu tiếng Việt, chấp nhận vì UI là tiếng Anh. Tên người chơi gõ tiếng Việt vẫn hiện được: dùng font hệ thống làm font dự phòng cho ô tên.
- Màu mực viền: `#24304a`. Nút bo tròn, viền 4px mực, bóng đổ cứng 6px, nhấn thì lún xuống.
- Màu người chơi theo thứ tự vào phòng (12 màu): đỏ `#ff5d6c`, xanh dương `#4fb4ff`, xanh lá `#55d36b`, vàng `#ffc727`, tím `#9a7cff`, cam `#ff8a4c`, hồng `#ff7fc8`, ngọc `#3fd0c9`, nâu `#b98557`, xanh đậm `#3f6fd8`, chanh `#a8d93f`, xám `#8c96a8`.

### Thư viện
- three.js `0.160.0` qua importmap từ `cdn.jsdelivr.net`, dùng `GLTFLoader`. Không dùng công cụ build.

### Mô hình 3D (Kenney, CC0)
Chép **chỉ những file dùng tới** vào `public/assets/kenney/<gói>/`, kèm `License.txt` của từng gói:

| Gói | Dùng cho | Đã tải |
|---|---|---|
| Cube Pets | 24 thú, có sẵn hoạt ảnh `idle, walk, run, eat, dance, gesture-positive, gesture-negative, static` | Có |
| Nature Kit | cây, bụi, đá, hoa, ruộng, hàng rào, gỗ, cây dừa, cây thông | Có |
| Platformer Kit | cây phủ tuyết, khối tuyết, sao/xu trang trí | Có |
| Fantasy Town Kit | nhà, kho, chòi cho cả 3 map | **Chưa — cần xin phép tải** |
| Holiday Kit | người tuyết, quà, đèn cho Snow Village | **Chưa — cần xin phép tải** |
| Pirate Kit | chòi, thùng, thuyền cho Beach | **Chưa — cần xin phép tải** |

Nếu không tải 3 gói cuối: nhà cửa dựng bằng khối trong code (như nhà kho ở mockup), Snow/Beach chỉ dùng Nature + Platformer.

### 24 thú (thứ tự cố định = mã `av` / `skin`)

| # | id | Tên | # | id | Tên | # | id | Tên |
|---|---|---|---|---|---|---|---|---|
| 0 | pig | Piggy | 8 | polar | Polar Bear | 16 | elephant | Elephant |
| 1 | bunny | Bunny | 9 | panda | Panda | 17 | giraffe | Giraffe |
| 2 | fox | Fox | 10 | koala | Koala | 18 | deer | Deer |
| 3 | cow | Cow | 11 | crab | Crab | 19 | hog | Boar |
| 4 | chick | Chick | 12 | parrot | Parrot | 20 | beaver | Beaver |
| 5 | cat | Kitty | 13 | monkey | Monkey | 21 | bee | Bee |
| 6 | dog | Puppy | 14 | lion | Lion | 22 | caterpillar | Caterpillar |
| 7 | penguin | Penguin | 15 | tiger | Tiger | 23 | fish | Fishy |

Danh sách này nằm trong **một file dùng chung** `public/core3d/animals.js` (UMD giống `badminton/physics.js`) để server và trình duyệt đọc cùng một nguồn.

## 3. Các màn hình

Tất cả là một trang (`public/index.html`), một canvas three.js dùng chung, mỗi màn thay cảnh 3D và lớp HTML phía trên.

### 3.1 Open
- Đảo cỏ tròn, thú nhảy múa và chạy vòng quanh, camera bay vòng chậm. Logo "Popo" 4 màu nhún từng chữ, dòng "Tiny games for friends & couples".
- "Tap to Start" nhấp nháy → chạm thì camera sà xuống, menu trượt lên: **Play** (tạo phòng), **Join Room**, **How to Play**.
- **Play / Join Room** mở hộp thoại: ô "Your name" (nhớ trong localStorage), và ô "Room code" (chỉ với Join). Lỗi từ server hiện ngay trong hộp thoại.
- Link mời dạng `?room=ABCD` mở thẳng hộp thoại Join với mã điền sẵn.
- **How to Play**: hộp thoại ngắn giới thiệu Hide & Seek, có hình nhỏ cho từng vai.
- Nút âm thanh (bật/tắt, nhớ trong localStorage). Nút cài đặt: chưa có chức năng, ẩn đi.

### 3.2 Lobby
- Thanh trên: nút rời phòng, tiêu đề "Lobby", ô **ROOM CODE** + nút **Invite** (copy link `?room=ABCD`, có thông báo "Invite link copied!").
- Cảnh 3D: bục màu theo người chơi, thú đứng trên bục. Tên dưới bục (`Name · Animal`), vương miện trên đầu chủ phòng, nhãn **✓ Ready**.
- **Tối đa 12 người**. Cách xếp bục:
  - Máy tính: ≤4 người một hàng; 5–8 người hai hàng so le; 9–12 người ba hàng. Bục và thú thu nhỏ theo số hàng.
  - Điện thoại dọc: bục của mình to ở giữa, những người khác nhỏ ở các hàng phía sau (như mockup).
  - Luôn có thêm một bục trống "Waiting for a friend…" nếu phòng chưa đầy.
- Đổi thú: hai mũi tên quanh bục của mình hoặc phím ←/→, gửi `profile {av}`.
- Bảng dưới: thẻ game (đợt này chỉ một thẻ Hide & Seek), cài đặt của game, nút **Ready** và **Start!**.
  - Chỉ chủ phòng đổi được cài đặt và thấy nút Start!. Người khác thấy cài đặt ở dạng chỉ đọc và dòng "Waiting for host…".
  - **Ready** chỉ để báo hiệu, không bắt buộc: chủ phòng bấm Start! lúc nào cũng được (đủ số người tối thiểu).
- Biểu cảm: nút mở bảng 8 biểu cảm (vẽ lại kiểu mới), hiện bong bóng trên đầu thú của người đó.

### 3.3 Get Ready (đầu mỗi ván)
- Bắt đầu cùng lúc với pha `hiding` của server (15 giây).
- Camera bay xuống map, banner "ROUND n / N · <Map name>", thẻ vai trò lớn: **"You are a HIDER"** (xanh lá) hoặc **"You are the SEEKER"** (đỏ), kèm 3 dòng hướng dẫn phím (máy tính) hoặc nút (điện thoại).
- Sau ~3 giây thẻ thu gọn thành nhãn vai trò ở góc:
  - Người trốn: điều khiển được ngay để đi trốn, đồng hồ "Hide! 0:12".
  - Người tìm: màn hình phủ tối, chữ "Seeker is counting…" và đồng hồ đếm ngược, không di chuyển được (đúng luật hiện tại).
- 3 giây cuối của pha `hiding` hiện đếm **3-2-1-GO!** to giữa màn hình cho mọi người.

### 3.4 Playing
Giống mockup `hs3d.html`:
- Camera nhìn chéo từ trên xuống, bám theo nhân vật của mình. Người tìm nhìn xa hơn một chút. Điện thoại dọc thì camera cao hơn.
- **HUD chung**: đồng hồ + số người trốn còn lại (chấm tròn) ở giữa trên; nhãn vai trò góc trái trên; dòng thông báo sự kiện dưới đồng hồ; nút biểu cảm.
- **Người trốn**:
  - Vòng trắng dưới chân + nhãn "You" (chỉ mình thấy). Thấy tên đồng đội trốn (`mates`) bằng nhãn nhỏ.
  - Nút/phím: Run (giữ, Shift), Swap (E), Call (Q), Sleep (Z), Decoy (F), có số giây hồi chiêu.
  - Cây/bụi mờ đi khi mình đứng sau.
- **Người tìm**:
  - Thú của mình (avatar ở Lobby) cầm súng nước dựng bằng code, vòng màu người chơi dưới chân, nhãn tên trên đầu (mọi người đều thấy người tìm).
  - Máy tính: rê chuột để ngắm (vòng ngắm trên mặt đất), bấm chuột để bắn. Điện thoại: chạm vào mặt đất để bắn vào điểm đó.
  - Thanh "Water tank" (máu). Nút Listen (R).
- **Hiệu ứng**: tia nước hình vòng cung + vệt nước bắn tung; thú bị bắn nhầm lắc đầu + bong bóng tiếng kêu; thú ngủ có "Zzz"; dấu chân mờ dần trong 5 giây; tiếng kêu (Call) hiện bong bóng trên con thú đó; người bị bắt bay lên và biến mất kèm thông báo "<Seeker> caught <Name>!"; Frenzy 5 giây cuối: viền đỏ nhấp nháy.
- Người bị bắt chuyển sang chế độ xem: camera đi theo người tìm, thấy hết người trốn còn lại.

**Ba map dựng từ cùng dữ liệu `genMap`** (nhà = `buildings`, ao = `ponds`, biển = `seas`, khu đất = `patches`, cây/bụi là chỗ trốn, đồ vật và đá trang trí, đường đi = dải đất nhạt):

| Map | Mặt đất | Nhà | Ao / biển | Khu đất | Cây, bụi, đồ vật |
|---|---|---|---|---|---|
| Farm | cỏ xanh, mảng đậm nhạt | kho đỏ | ao nước xanh, viền cát | ruộng bí, ngô, cà rốt, lúa mì | cây sồi/tròn, bụi, đống gỗ, gốc cây, hàng rào bao quanh |
| Snow Village | tuyết trắng, mảng xanh nhạt | nhà gỗ mái tuyết | hồ băng xanh nhạt | vườn tuyết có người tuyết / quà | thông phủ tuyết, bụi tuyết, đá, đèn lồng |
| Beach | cát vàng | chòi lá | biển ở phía nam (`seas`), đầm nước | sân bóng chuyền cát, khu ghế phơi | cây dừa, bụi nhiệt đới, thùng gỗ, vỏ sò, đá |

### 3.5 Round results
- Hiện khi nhận `round` từ server, phủ lên cảnh đang chơi trong `wait` giây (7 giây; ván cuối 10 giây).
- Tiêu đề "Hiders win!" hoặc "Seeker wins!", bảng từng người: màu, tên, vai trò, sống/bị bắt, điểm ván này (+pts), tổng điểm. Đếm ngược tới ván sau.

### 3.6 Final results
- Sau ván cuối: bục 1-2-3 (thú của 3 người cao điểm nhất), người nhất đội vương miện và nhảy múa, pháo giấy. Danh sách các hạng còn lại bên cạnh.
- Nút **Back to lobby** (mọi người) — server đã tự quay về lobby khi game gọi `end()`, nên màn này chỉ là lớp phủ trước khi hiện Lobby; hiện tối đa 10 giây hoặc tới khi bấm.

## 4. Thay đổi phía server

Giữ giao thức và luồng hiện tại. Danh sách thay đổi:

### `server/core.js`
- `AVATARS = 24` (mã thú theo bảng mục 2).
- Thêm trạng thái `ready` cho người chơi: tin nhắn `profile { ready: bool }`; gửi trong `lobby.players[].ready`; tự đặt lại `false` khi game kết thúc.
- Thông báo lỗi sang tiếng Anh: "Room not found", "This room is already playing — wait for the next game", "Room is full", "Need at least N players".
- Tên mặc định "Player".

### `server/index.js`
- Chỉ đăng ký `hideseek`. Lái Mò và Cầu Lông bỏ khỏi `GAMES` (file vẫn còn).

### `server/games/hideseek/index.js`
- `meta` tiếng Anh: name "Hide & Seek", desc "Blend into the herd — or grab the water gun and hunt!", tag "Action". Cài đặt: Map (Random, Farm, Snow Village, Beach), Rounds (Everyone seeks once, 2, 4, 6).
- **Bắn trúng tính trên mặt phẳng**: bỏ phần lệch theo chiều cao (`KIND_H`). Tia nước đi từ vị trí người tìm tới điểm ngắm trên mặt đất; trúng con đầu tiên có khoảng cách tới tia < `HIT_R`. `HIT_R` tăng từ 20 lên **35** (thú 3D to hơn khi nhìn từ trên xuống). Tầm bắn `RANGE` giữ 480.
- Gửi kèm mã thú của người tìm trong `k`: `[id, name, x, y, hp, ang, alive, av]`.
- Số thú máy: `round(W*H / 150000) + người chơi * 4` (thay cho `/100000` và `*6`), để nhẹ cho điện thoại. Kiểm tra lại cảm giác "đông vui" khi chơi thử; chỉnh nếu cần.
- Mọi chuỗi gửi về client (nếu có) sang tiếng Anh.

### `server/games/hideseek/maps.js`
- `kinds` đổi sang mã thú mới:
  - Farm: pig, cow, chick, bunny, dog, cat → `[0, 3, 4, 1, 6, 5]`
  - Snow Village: penguin, polar, fox, deer, beaver → `[7, 8, 2, 18, 20]`
  - Beach: crab, parrot, monkey, koala, tiger → `[11, 12, 13, 10, 15]`
- Giữ nguyên hình dạng bản đồ (nhà, ao, biển, khu đất, cây, bụi, đồ vật, đá, đường đi).

## 5. Kiến trúc phía trình duyệt

Quy ước toạ độ: **1 đơn vị 3D = 100 đơn vị server**; `x` server → `x` 3D, `y` server → `z` 3D.

```
public/
  index.html            khung trang: importmap, font, các lớp HTML, <script type="module" src="app.js">
  app.js                điều phối màn hình, giữ trạng thái phòng
  core3d/
    animals.js          bảng 24 thú (UMD, dùng chung với server)
    net.js              WebSocket: kết nối, tự nối lại, rejoin bằng token (chuyển từ core/core.js)
    engine.js           renderer, camera, vòng lặp, đổi cảnh, xử lý resize, chất lượng theo thiết bị
    assets.js           nạp GLB có cache; pet(id) → {root, mixer, play()}; prop(file, height)
    ui.css              nút, hộp thoại, chip, HUD dùng chung
    ui.js               tiện ích HTML: toast, modal, nhãn bám theo vật 3D
    sfx.js              bíp/hiệu ứng WebAudio (chuyển từ core cũ)
    screens/open.js, lobby.js, results.js
  games/hideseek3d/
    client.js           nhận init/s/fx/round/sense, điều khiển, HUD
    world.js            dựng map 3D từ dữ liệu genMap theo theme
    entities.js         thú máy + người trốn + người tìm: nội suy vị trí, chọn hoạt ảnh
    fx.js               tia nước, vệt nước, dấu chân, bong bóng, Zzz, pháo giấy
  assets/kenney/...     mô hình + License.txt
```

- **Nội suy**: server gửi trạng thái 20 lần/giây; client hiển thị trễ ~100ms và nội suy giữa 2 trạng thái để thú đi mượt. Hướng mặt lấy theo hướng di chuyển.
- **Chọn hoạt ảnh** từ dữ liệu server: đang di chuyển chậm → `walk`, nhanh → `run`, đứng → `idle` (thỉnh thoảng `eat`), cờ ngủ → `static` + Zzz, cờ choáng → `gesture-negative`.
- **Không lộ người trốn**: thực thể gửi xuống đã trộn chung thú máy và người trốn (như hiện tại); client không có cách nào phân biệt khi mình là người tìm, ngoài `mates` (chỉ gửi cho người trốn / người đã bị bắt).
- **Đổi thú (Swap)**: thay mô hình tại chỗ, dùng lại mixer mới, giữ vị trí và hướng.
- **Chất lượng theo thiết bị**:
  - Điện thoại (`pointer: coarse`): tắt bóng đổ, `pixelRatio` tối đa 1.5, chỉ cập nhật hoạt ảnh cho thú trong khung nhìn (+ lề).
  - Máy tính: bóng đổ mềm, `pixelRatio` tối đa 2.
  - Dùng chung geometry/material giữa các bản sao của cùng một con thú (clone không sao chép geometry).
- Màn hình cũ (`public/core/*`, `public/games/hideseek/*`) bị thay thế. Thư mục `public/games/drive` và `public/games/badminton` giữ nguyên, không được nạp.

## 6. Xử lý lỗi và trường hợp biên
- Mất kết nối: lớp phủ "Reconnecting…" như hiện tại; vào lại thì nhận `init` + trạng thái và dựng lại cảnh.
- Không tải được mô hình: hiện "Couldn't load the game files. Check your connection and reload." kèm nút Reload.
- WebGL không có: hiện thông báo "Your browser doesn't support 3D graphics" thay vì trang trắng.
- Chủ phòng rời: core đã chuyển chủ phòng; Lobby cập nhật vương miện và nút Start!.
- Người chơi rời giữa ván: game xử lý như hiện tại (`onLeave`).
- Điện thoại xoay ngang/dọc: camera và HUD tự sắp lại, không bắt buộc xoay.

## 7. Kiểm tra
1. **Bot qua mạng** (Node + `ws`, trong scratchpad): 3–4 bot vào phòng, bắt đầu, người tìm bắn ngẫu nhiên và bắn trúng người trốn bằng toạ độ thật; chạy đủ các ván tới `end()`; kiểm tra điểm, xoay vòng người tìm, phạt bắn nhầm, Frenzy, rejoin.
2. **Hai tab trình duyệt**: một khổ máy tính, một khổ điện thoại (375×812). Chơi thử cả hai vai; xem Lobby với 2, 5 và 12 người (bot); xem cả 3 map.
3. Không có lỗi console trong suốt một trận.
4. Đo số khung hình/giây trên trình duyệt khi pane hiện; nếu có điện thoại thật thì nhờ bạn thử qua wifi.

## 8. Thứ tự làm (sẽ chi tiết trong kế hoạch)
1. Nền tảng: `animals.js`, sửa server (core, index, hideseek, maps), cập nhật bot test.
2. Engine + assets + net + UI chung.
3. Màn Open và Lobby.
4. Hide & Seek: world (Farm trước), entities, điều khiển, HUD, hiệu ứng.
5. Get Ready, Round results, Final results.
6. Snow Village và Beach.
7. Tối ưu điện thoại, dọn file cũ, cập nhật README.

## 9. Việc cần bạn quyết trước khi làm
- Có tải thêm **Fantasy Town Kit, Holiday Kit, Pirate Kit** không (mình sẽ báo tên file và dung lượng trước khi tải)? Nếu không, nhà cửa dựng bằng khối trong code.
