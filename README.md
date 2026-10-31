# Popo

Web game nhỏ cho bạn bè và cặp đôi chơi từ xa, chơi được trên cả máy tính và điện thoại.
Toàn bộ đồ họa vẽ bằng canvas/SVG (không dùng emoji hay file ảnh).

## Chạy
```bash
npm install
npm start
```
Mở http://localhost:3000. Bạn bè cùng wifi vào bằng địa chỉ IP mà server in ra.

## Đưa lên mạng
Popo cần một **máy chủ Node chạy liên tục** để giữ kết nối WebSocket.
**Vercel, Netlify, GitHub Pages không chạy được phần này** (chỉ phục vụ file tĩnh) — web sẽ hiện nhưng không tạo được phòng.

Cách dễ nhất — **Render** (có gói miễn phí):
1. Vào https://render.com, đăng nhập bằng GitHub.
2. **New → Blueprint** → chọn repo `popo` (Render đọc file `render.yaml` có sẵn) → **Apply**.
3. Đợi build xong, mở địa chỉ dạng `https://popo-xxxx.onrender.com` — gửi link này cho bạn bè.

Gói miễn phí của Render sẽ "ngủ" khi không ai vào ~15 phút; lần vào đầu sau đó mất khoảng 30–50 giây để thức dậy
(web tự thử kết nối lại trong lúc chờ). Railway, Fly.io hoặc VPS cũng chạy được: lệnh khởi động là `npm start`, cổng lấy từ biến `PORT`.

**Vẫn muốn giữ trang web trên Vercel?** Deploy máy chủ lên Render như trên, rồi sửa `public/config.js`:
```js
window.POPO_SERVER = 'https://popo-xxxx.onrender.com';
```

## Nền tảng (phần dùng chung cho mọi game)
- Tạo phòng / vào bằng mã 4 chữ hoặc link mời, chọn nhân vật, chủ phòng chọn game và cài đặt.
- Rớt mạng (chuyển app, mất sóng, tải lại trang) được giữ chỗ 30 giây và tự vào lại đúng ván.
- 8 biểu cảm gửi cho cả phòng, đếm số trận thắng của từng người.

## Trò chơi: Trốn Tìm Nông Trại
- 3 bản đồ, mỗi bản đồ có bộ thú riêng:
  - Nông trại: heo, bò, cừu, gà, vịt, thỏ
  - Làng tuyết: chim cánh cụt, gấu trắng, hải cẩu, cáo tuyết, tuần lộc
  - Bãi biển: cua, rùa biển, hải âu, hồng hạc, rái cá
- Nhiều ván, đổi vai sau mỗi ván, cộng điểm, có bảng xếp hạng chung cuộc.
- Người trốn: Chạy (để lại dấu chân), Kêu (−3 giây), Giả ngủ (bị bắn cũng như bắn nhầm thú),
  Phân thân (thả thú giả chạy đi — không giới hạn, hồi 20 giây), Đổi thú (bất cứ lúc nào).
- Người tìm: súng nước, Nghe ngóng (biết người trốn gần hay xa).
- **Giờ G — 5 giây cuối ván:** người tìm giữ chuột/giữ tay để bắn liên tục, bắn nhầm không mất máu, chạy nhanh hơn.
- Test nhanh: `HS_ROUND_T=30 HS_HIDE_T=3 npm start` để rút ngắn thời gian ván.
- Máy tính: WASD + chuột, phím Q/E/F/R. Điện thoại: kéo nửa trái để đi, chạm nửa phải để bắn, nút kỹ năng.

## Trò chơi: Lái Mò (2 người)
- Một người cầm lái nhưng kính mờ, không thấy đường. Người kia thấy bản đồ từ trên cao và chỉ đường
  bằng 8 nút tín hiệu: Trái, Phải, Thẳng, Ga, Chậm, Phanh, Lùi, Đỗ (hoặc nói qua cuộc gọi).
- Đón các bé thú ở trạm (dừng sát trạm cho khách lên), tránh vật cản, vũng trơn, thú băng qua đường, về đích trước khi hết giờ.
- Tài xế có đồng hồ tốc độ và "đèn va chạm" kêu tít tít khi sắp đâm; xe rung khi chạy ra cỏ.
- Hết mỗi màn đổi vai. Đường sinh ngẫu nhiên, càng về sau càng dài và khó.
- 4 bản đồ: Đồng quê, Đèo tuyết (đường băng rất trơn), Phố biển, Phố đêm.
- Tuỳ chọn: số màn, tín hiệu trễ 0,5–1 giây (khó hơn: phải chỉ trước).
- Máy tính: tài xế A/D lái, W ga, S hoặc Space phanh/lùi; hoa tiêu bấm phím ghi trên nút, T xoay bản đồ.
  Điện thoại: nút lái và nút tín hiệu trên màn hình.

## Cấu trúc
```
server/index.js            web server + đăng ký game
public/config.js           địa chỉ máy chủ game (để trống nếu chạy chung)
server/core.js             phòng, vào lại khi rớt mạng, biểu cảm, cài đặt
server/games/hideseek/     luật chơi (index.js) + sinh bản đồ (maps.js)
server/games/drive/        Lái Mò: luật chơi (index.js) + sinh đường (track.js)
public/core/               trang chủ, phòng chờ, kết nối, biểu cảm, hình nhân vật dùng chung
public/games/hideseek/     giao diện game, vẽ bản đồ (themes.js), CSS
public/games/drive/        giao diện Lái Mò (hoa tiêu + tài xế), CSS
```

## Thêm một game mới
1. Server: tạo `server/games/<id>/index.js` xuất `{ meta, create(api) }` (xem chú thích đầu `server/core.js`), rồi đăng ký trong `server/index.js`.
2. Client: tạo `public/games/<id>/client.js` gọi `registerGame('<id>', { thumb, mount, onMsg, unmount })` (xem chú thích đầu `public/core/core.js`), thêm thẻ `<script>` vào `public/index.html`.
3. Xoá game đó khỏi danh sách "Sắp ra mắt" (`COMING`) trong `public/core/core.js`.
