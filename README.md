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
- Người trốn: Chạy (để lại dấu chân), Kêu (−3 giây), Giả ngủ (bị bắn cũng như bắn nhầm thú), Mồi nhử (thả thú giả chạy đi), Đổi thú (lúc đang trốn).
- Người tìm: súng nước, Nghe ngóng (biết người trốn gần hay xa).
- Máy tính: WASD + chuột, phím Q/E/F/R. Điện thoại: kéo nửa trái để đi, chạm nửa phải để bắn, nút kỹ năng.

## Cấu trúc
```
server/index.js            web server + đăng ký game
public/config.js           địa chỉ máy chủ game (để trống nếu chạy chung)
server/core.js             phòng, vào lại khi rớt mạng, biểu cảm, cài đặt
server/games/hideseek/     luật chơi (index.js) + sinh bản đồ (maps.js)
public/core/               trang chủ, phòng chờ, kết nối, biểu cảm, hình nhân vật dùng chung
public/games/hideseek/     giao diện game, vẽ bản đồ (themes.js), CSS
```

## Thêm một game mới
1. Server: tạo `server/games/<id>/index.js` xuất `{ meta, create(api) }` (xem chú thích đầu `server/core.js`), rồi đăng ký trong `server/index.js`.
2. Client: tạo `public/games/<id>/client.js` gọi `registerGame('<id>', { thumb, mount, onMsg, unmount })` (xem chú thích đầu `public/core/core.js`), thêm thẻ `<script>` vào `public/index.html`.
3. Xoá game đó khỏi danh sách "Sắp ra mắt" (`COMING`) trong `public/core/core.js`.
