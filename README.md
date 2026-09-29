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

Lần đầu vào **Cài đặt**:

1. Điền **tên kênh** (`@username`).
2. Bấm **Đăng nhập TikTok**: một cửa sổ trình duyệt mở ra, bạn đăng nhập, tool tự nhận biết và đóng
   cửa sổ. (Hoặc điền CDP URL để dùng tab Brave đang mở sẵn, xem phần Brave bên dưới.)

### Dữ liệu lấy từ đâu

| Dữ liệu | Nguồn | Lưu trên máy? |
|---|---|---|
| Thông tin kênh (tên, avatar, bio, người theo dõi, lượt thích, số video) | Lấy trực tiếp từ trang kênh trên TikTok | **Không** — chỉ giữ tạm 5 phút trong RAM để chuyển trang cho nhanh |
| Video đã đăng (caption, hashtag, ngày đăng, thời lượng, ảnh bìa, xem/thích/bình luận/chia sẻ/lưu, ghim, riêng tư, âm thanh, link) | Lấy trực tiếp từ TikTok | **Không** |
| Video chưa đăng (hàng chờ) | Bạn tải lên | Có: `data/pending/` (file video + file .json cùng tên). Đăng xong thì tự xoá |
| Cài đặt | Bạn nhập | `data/settings.json` |
| Nhật ký thao tác | Tool ghi | `data/logs/YYYY-MM-DD.txt`, mỗi ngày 1 file |

Tool đọc dữ liệu bằng trình duyệt đã đăng nhập: mở trang `tiktok.com/@kênh`, đọc thông tin hồ sơ
và danh sách video mà chính trang TikTok tải về khi cuộn (xem kênh của mình nên thấy cả video riêng
tư). Mỗi lần lấy mất khoảng 10–60 giây; bấm **Làm mới từ TikTok** để lấy số liệu mới nhất. Nếu
TikTok hiện captcha, mở trình duyệt của tool (tắt chạy ẩn) và giải captcha rồi thử lại.

### Các trang

| Trang | Làm được gì |
|---|---|
| **Tổng quan** | Thông tin kênh, tổng/trung bình lượt xem, thích, bình luận, tỉ lệ tương tác, top video xem nhiều nhất, tình trạng hàng chờ, nhật ký hôm nay |
| **Video trên kênh** | Bảng hoặc lưới toàn bộ video trên TikTok, tìm kiếm, lọc công khai/riêng tư, sắp xếp theo xem/thích/bình luận/chia sẻ/lưu/tương tác. Bấm 1 video để xem bằng **player TikTok nhúng (iframe)** kèm đầy đủ thông tin và link mở trên TikTok (video riêng tư thì chỉ có link) |
| **Hàng chờ đăng** | Kéo thả nhiều video để tải lên, soạn caption, chèn bộ hashtag, chọn ai được xem, hẹn giờ, lên lịch hàng loạt, Đăng ngay / Thử lại |
| **Lịch đăng** | Theo tuần: video đã đăng (từ TikTok) và video đã lên lịch (từ hàng chờ) |
| **Nhật ký** | Xem nhật ký theo ngày, lọc theo mức và nguồn, **tải file .txt** |
| **Cài đặt** | Tên kênh, số video lấy mỗi lần, đăng nhập TikTok, cách đăng, trình duyệt (Chromium/Brave/CDP), khoảng cách giữa 2 bài, số bài tối đa/ngày, bộ hashtag |

### Nhật ký thao tác

Mọi thao tác được ghi vào `data/logs/YYYY-MM-DD.txt` (1 file mỗi ngày, theo giờ máy chạy server):

```
2026-09-29 13:26:42 | INFO    | web:127.0.0.1 | upload     | Tải lên "Kaiju đại chiến" (0.1 MB) vào hàng chờ | pending=bb27…
2026-09-29 13:26:43 | INFO    | web:127.0.0.1 | edit       | Sửa "Gipsy Danger ra khơi": caption, quyền xem → Mọi người | pending=372d…
2026-09-29 13:26:47 | SUCCESS | scheduler | publish    | Đã đăng "Gipsy Danger ra khơi" lên TikTok (quyền xem: PUBLIC_TO_EVERYONE) | …
2026-09-29 13:28:22 | SUCCESS | system    | fetch      | Lấy dữ liệu kênh @gipsy.danger từ TikTok: 128400 người theo dõi, 8/8 video |
```

Cột: thời gian · mức (INFO/SUCCESS/WARN/ERROR) · nguồn (`web:<IP>` = người dùng trên web,
`scheduler` = tự động đăng, `cli`, `system`) · thao tác · nội dung · đối tượng. Các lệnh CLI cũng
ghi vào cùng file.

### Bộ lập lịch

- Server kiểm tra mỗi 20 giây, mỗi lần đăng **tối đa 1** video đã tới giờ hẹn.
- Tôn trọng **khoảng cách tối thiểu** giữa 2 bài và **số bài tối đa mỗi ngày** (đếm từ nhật ký).
  Nút **Đăng ngay** bỏ qua hai giới hạn này.
- Đăng lỗi → video ở lại hàng chờ với trạng thái **Lỗi** kèm lý do (và ảnh chụp màn hình trong
  `errors/`); bấm **Thử lại** khi đã xử lý. Nếu TikTok báo giới hạn tần suất, video tự lùi lịch 15 phút.
- **Server phải đang chạy** thì mới tự đăng được.

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

## 2. Cách dùng API chính thức (cần key) — không bị captcha

**Trên developers.tiktok.com (app của bạn):**

1. Thêm product **Login Kit**, **Display API** và **Content Posting API** (bật *Direct Post*).
2. Bật các scope: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`,
   `video.publish`, `video.upload`.
3. Khai báo **Redirect URI** khớp với `TIKTOK_REDIRECT_URI` trong `.env`. Với app loại **Desktop**,
   dùng `http://localhost:3455/callback` và đặt `TIKTOK_USE_PKCE=1`. Với app loại **Web**, TikTok
   bắt buộc URL https, tool sẽ hỏi bạn dán lại URL sau khi đăng nhập.
4. App **chưa được audit**: thêm tài khoản TikTok của bạn vào *Sandbox / Target users*; video chỉ
   đăng được ở chế độ `SELF_ONLY` (riêng tư) cho tới khi app được duyệt.

**Trên máy:**

```bash
# .env: UPLOAD_METHOD=api, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI (+ TIKTOK_USE_PKCE)
node src/cli.mjs login --api   # mở link in ra → cấp quyền → token lưu vào .tokens.json
node src/cli.mjs whoami        # in thông tin kênh, 5 video gần nhất và quyền đăng bài
```

Trong web app: **Cài đặt → Phương thức → Content Posting API**, bấm Lưu. Từ đó thông tin kênh và
danh sách video lấy qua **Display API** (nhanh, không mở trình duyệt, không captcha), và đăng bài
qua Content Posting API.

Giới hạn của Display API: chỉ trả **video công khai**, không có số lượt **lưu**, trạng thái ghim
và nhạc nền. Nếu thiếu scope, tool báo rõ scope nào cần thêm.

Token tự refresh (access token sống 24h, refresh token sống 365 ngày). Muốn cấp thêm scope thì
chạy lại `login --api`.

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
