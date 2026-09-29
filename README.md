# TikTok Auto Upload

Tự động đăng và quản lý nội dung kênh TikTok. Gồm:

- **Web app quản lý** (`npm start`): thư viện video, soạn caption, lên lịch, lịch tuần, nhật ký,
  tự động đăng theo nhịp bạn đặt.
- **CLI** (`node src/cli.mjs …`): đăng nhanh từ terminal hoặc chạy bằng cron.

Có 2 cách đăng lên TikTok:

| Cách | Cần key? | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **browser** (mặc định) | Không | Cài là chạy, đăng công khai được ngay | Phụ thuộc giao diện TikTok Studio, TikTok đổi giao diện thì có thể phải sửa selector |
| **api** | Có | Ổn định, chính thức | Phải tạo app; app chưa audit chỉ đăng được video riêng tư |

## Web app quản lý kênh

```bash
git clone https://github.com/hoagphucdev/tiktok-auto-upload
cd tiktok-auto-upload
npm run setup      # cài thư viện + Chromium + build giao diện
npm start          # mở http://127.0.0.1:8787
```

Lần đầu vào **Cài đặt → Đăng nhập TikTok**: một cửa sổ trình duyệt mở ra, bạn đăng nhập, tool tự
nhận biết và đóng cửa sổ. (Hoặc điền CDP URL để dùng tab Brave đang mở sẵn, xem phần Brave bên dưới.)

| Trang | Làm được gì |
|---|---|
| **Tổng quan** | Số video theo trạng thái, số bài hôm nay / giới hạn, video sắp đăng, hoạt động gần đây, nút tạm dừng tự động đăng |
| **Thư viện video** | Kéo thả nhiều video để tải lên (vào mục Nháp), lọc theo trạng thái, tìm kiếm, chọn nhiều để lên lịch hàng loạt / chuyển về nháp / xoá |
| **Sửa video** | Xem video, sửa caption (đếm ký tự, hiện hashtag), chèn nhanh bộ hashtag, chọn ai được xem, hẹn giờ, tag nội bộ, ghi chú, lịch sử; nút Lên lịch / Đăng ngay / Thử lại |
| **Lịch đăng** | Xem theo tuần các video đã lên lịch và đã đăng |
| **Nhật ký** | Mọi hoạt động và lỗi, lọc theo mức |
| **Cài đặt** | Đăng nhập TikTok, cách đăng (browser/API), trình duyệt (Chromium/Brave/CDP), khoảng cách giữa 2 bài, số bài tối đa/ngày, bộ hashtag |

Cách bộ lập lịch chạy:

- Server kiểm tra mỗi 20 giây, mỗi lần đăng **tối đa 1** video đã tới giờ hẹn.
- Tôn trọng **khoảng cách tối thiểu** giữa 2 bài và **số bài tối đa mỗi ngày**. Nút **Đăng ngay**
  bỏ qua hai giới hạn này.
- Đăng lỗi → video sang trạng thái **Lỗi** kèm lý do (và ảnh chụp màn hình trong `errors/` ở chế độ
  browser); bấm **Thử lại** khi đã xử lý. Nếu TikTok báo giới hạn tần suất, video tự lùi lịch 15 phút.
- **Server phải đang chạy** thì mới tự đăng được. Nếu tắt máy lúc tới giờ, video sẽ được đăng khi
  bạn bật lại server.

Dữ liệu (video đã tải lên + `db.json`) nằm trong `data/`. Sao lưu thư mục này là đủ.

Truy cập từ điện thoại cùng mạng Wi-Fi: đặt `HOST=0.0.0.0` và `ADMIN_PASSWORD=...` trong `.env`, rồi
vào `http://<IP máy tính>:8787`.

Phát triển giao diện (tự reload): chạy `npm run dev:server` và `npm run dev:web` ở 2 terminal, rồi
mở http://localhost:5173.

# CLI

## 1. Cách không cần key (trình duyệt)

Tool mở Chromium bằng Playwright và thao tác trên trang upload của TikTok Studio thay bạn, giống
như bạn tự bấm tay. Bạn đăng nhập **một lần**, phiên đăng nhập được lưu trong `.browser-profile/`.

```bash
git clone https://github.com/hoagphucdev/tiktok-auto-upload
cd tiktok-auto-upload
npm run setup                     # cài Playwright + Chromium
node src/cli.mjs login            # cửa sổ trình duyệt mở ra → đăng nhập TikTok → nhấn Enter ở terminal
node src/cli.mjs upload ./video.mp4 -c "Gipsy Danger #robot #fyp" -p PUBLIC_TO_EVERYONE
```

- Nên chạy có hiện cửa sổ (`HEADLESS=0`, mặc định), vì TikTok hay chặn trình duyệt chạy ẩn.
  Nếu gặp captcha, bạn cứ tự giải trong cửa sổ đó.
- Nếu lỗi, tool chụp màn hình vào `errors/` để xem nó đang kẹt ở bước nào.
- Nếu phiên đăng nhập hết hạn, chạy lại `node src/cli.mjs login`.
- Các option `--draft`, `--no-comment`, `--no-duet`, `--no-stitch`, `--cover-ms` chỉ dùng được ở
  chế độ API.
- ⚠️ Tự động hoá qua trình duyệt không phải cách TikTok chính thức hỗ trợ. Hãy đăng với tần suất
  vừa phải (vài video mỗi ngày) để tránh tài khoản bị hạn chế.

### Dùng Brave

**Cách A: tool tự mở Brave.** Thêm vào `.env`:

```env
TIKTOK_BROWSER=brave
```

Tool tự tìm Brave ở chỗ cài mặc định trên Windows, macOS và Linux. Nếu không thấy, đặt
`CHROMIUM_PATH` trỏ tới `brave.exe`. Brave sẽ mở bằng profile riêng `.browser-profile/`, nên
lần đầu bạn vẫn chạy `node src/cli.mjs login` để đăng nhập TikTok.

**Cách B: mở tab trong cửa sổ Brave bạn đang dùng.**

1. Mở Brave kèm cổng điều khiển. Brave (giống Chrome bản mới) chỉ cho bật cổng này khi dùng một
   thư mục profile **riêng**, không phải profile mặc định:

   ```bat
   :: Windows
   "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\BraveTikTok"
   ```

   ```bash
   # macOS
   "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --remote-debugging-port=9222 --user-data-dir="$HOME/.brave-tiktok"
   # Linux
   brave-browser --remote-debugging-port=9222 --user-data-dir="$HOME/.brave-tiktok"
   ```

   Nên tạo shortcut cho lệnh này. Lần đầu, đăng nhập TikTok trong cửa sổ Brave đó; các lần sau
   Brave nhớ phiên đăng nhập.
2. Thêm vào `.env`:

   ```env
   BROWSER_CDP_URL=http://127.0.0.1:9222
   ```

3. Chạy `upload`/`queue`/`watch` như bình thường. Mỗi video, tool mở **một tab mới** trong Brave
   đó, đăng xong thì đóng tab, còn Brave vẫn mở nguyên.

> ⚠️ Khi cổng 9222 đang mở, mọi chương trình trên máy bạn đều điều khiển được cửa sổ Brave đó.
> Chỉ dùng profile riêng này cho TikTok, và đóng Brave khi không cần chạy tool.

## 2. Cách dùng API chính thức (cần key)

1. Vào https://developers.tiktok.com → **Manage apps** → tạo app.
2. Thêm product **Login Kit** và **Content Posting API** (bật *Direct Post* nếu muốn đăng thẳng).
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`.
4. Khai báo **Redirect URI**, ví dụ `http://localhost:3455/callback` (app dạng Desktop) hoặc URL
   https của bạn (app dạng Web).
5. Lấy **Client key** và **Client secret**.

> ⚠️ App **chưa được TikTok audit** chỉ đăng được video ở chế độ `SELF_ONLY` (riêng tư), và chỉ
> cho các tài khoản đã thêm vào mục *Sandbox / Target users*.

```bash
cp .env.example .env      # đặt UPLOAD_METHOD=api, điền TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI
node src/cli.mjs login    # mở link in ra, cấp quyền → token lưu vào .tokens.json
node src/cli.mjs whoami   # kiểm tra tài khoản & các mức privacy được phép
```

Token tự refresh (access token sống 24h, refresh token sống 365 ngày).

## 3. Đăng 1 video

```bash
node src/cli.mjs upload ./video.mp4 -c "Gipsy Danger #robot #fyp" -p SELF_ONLY
node src/cli.mjs upload ./video.mp4 --api --draft    # (API) gửi vào nháp, tự bấm đăng trong app TikTok
```

Mặc định là `SELF_ONLY` (chỉ mình bạn xem); đổi bằng `-p` hoặc `DEFAULT_PRIVACY` trong `.env`.

## 4. Tự động hoá bằng thư mục queue

Thả video vào `queue/`. Nếu cần, thêm file cùng tên để khai báo caption hoặc tuỳ chọn:

```
queue/
  01-intro.mp4
  01-intro.txt          ← chỉ chứa caption
  02-battle.mp4
  02-battle.json        ← tuỳ chọn chi tiết
```

`02-battle.json`:

```json
{
  "caption": "Trận chiến #pacificrim #fyp",
  "privacy": "PUBLIC_TO_EVERYONE",
  "mode": "direct",
  "disableComment": false,
  "disableDuet": true,
  "disableStitch": true,
  "coverMs": 1500,
  "publishAt": "2026-10-01T19:00:00+07:00"
}
```

```bash
node src/cli.mjs queue --max 3 --gap 60    # đăng tối đa 3 video, cách nhau 60s
node src/cli.mjs watch --interval 120      # chạy nền, mỗi 2 tiếng đăng 1 video
```

- Video được sắp xếp theo tên file, nên có thể đặt tiền tố `01-`, `02-`, … để định thứ tự.
- Video có `publishAt` sẽ nằm chờ cho tới đúng giờ đó.
- Video đăng thành công chuyển sang `queue/done/`, video lỗi chuyển sang `queue/failed/`, và mọi
  kết quả được ghi vào `queue/log.jsonl`.
- Lỗi mạng hoặc rate limit thì video được giữ lại trong queue để lần sau thử lại.

Muốn chạy định kỳ bằng cron thay cho `watch`:

```cron
0 */3 * * * cd /path/to/tiktok-auto-upload && node src/cli.mjs queue --max 1 >> cron.log 2>&1
```

## Giới hạn của TikTok (chế độ API)

- Định dạng MP4, MOV hoặc WebM (khuyến nghị MP4/H.264), dung lượng tối đa 4GB, caption tối đa
  2200 ký tự.
- Tối đa khoảng 6 request init mỗi phút cho mỗi token, và mỗi creator chỉ đăng được một số
  video nhất định mỗi ngày (thường khoảng 15). Nên để `--interval` từ 60 phút trở lên.
- Thời lượng tối đa tuỳ tài khoản (`max_video_post_duration_sec` trong `whoami`).

## Test

```bash
npm test
```
