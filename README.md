# TikTok Auto Upload

Tự động đăng và quản lý nội dung kênh TikTok qua **API chính thức của TikTok** (không điều khiển
trình duyệt, không captcha):

- **Content Posting API**: đăng video (đăng thẳng với `video.publish`, hoặc gửi vào hộp nháp với `video.upload`).
- **Display API**: thông tin kênh và danh sách video (`user.info.*`, `video.list`).
- **Login Kit** (OAuth): đăng nhập, token tự làm mới.

Gồm **web app quản lý** (`npm start`), **CLI** (`node src/cli.mjs …`) và **callback Worker** trên
Cloudflare ([`callback-worker/`](callback-worker/README.md)) cho Redirect URI và webhook.

## 1. Chuẩn bị app TikTok

Trên developers.tiktok.com → app của bạn:

1. Products: **Login Kit**, **Display API**, **Content Posting API** (bật **Direct Post** nếu có —
   để có scope `video.publish` đăng thẳng).
2. Scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`
   (+ `video.publish` nếu bật được Direct Post).
3. Deploy [`callback-worker/`](callback-worker/README.md) lên Cloudflare, rồi khai báo:
   - **Login Kit → Redirect URI (Web)**: `https://tiktok-callback.<tên>.workers.dev/callback`
   - **Webhooks → Callback URL**: `https://tiktok-callback.<tên>.workers.dev/webhook`
4. App chưa được duyệt: thêm tài khoản TikTok của bạn vào *Sandbox / Target users*; video chỉ đăng
   được ở chế độ `SELF_ONLY`. Nếu dùng client key Sandbox, cấu hình ở phần Sandbox.

## 2. Cài đặt & đăng nhập

```bash
git clone https://github.com/hoagphucdev/tiktok-auto-upload
cd tiktok-auto-upload
cp .env.example .env     # điền TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, TIKTOK_SCOPES
npm run setup            # cài thư viện + build giao diện
npm start                # mở http://127.0.0.1:8787
```

Vào **Cài đặt → Đăng nhập TikTok**: trang cấp quyền mở ở tab mới, bấm cho phép; callback Worker
trả mã về và server tự lưu token (`.tokens.json`). Hoặc từ terminal: `node src/cli.mjs login`
rồi `node src/cli.mjs whoami` để kiểm tra.

Lỗi thường gặp khi đăng nhập:

| TikTok báo | Sửa |
|---|---|
| `code_challenge` | Đặt `TIKTOK_USE_PKCE=1` |
| `redirect_uri` | `TIKTOK_REDIRECT_URI` phải khớp y hệt URI trong Login Kit (tab Web cần `https`) |
| `scope` | `TIKTOK_SCOPES` chỉ được chứa scope đã bật cho app |

Token tự làm mới (access token 24 giờ, refresh token 1 năm). Muốn cấp thêm quyền thì đăng nhập lại.

## Web app quản lý kênh

### Dữ liệu lấy từ đâu

| Dữ liệu | Nguồn | Lưu trên máy? |
|---|---|---|
| Thông tin kênh (tên, avatar, bio, người theo dõi, lượt thích, số video) | Display API | **Không** — chỉ giữ tạm 5 phút trong RAM |
| Video đã đăng (caption, hashtag, ngày đăng, thời lượng, ảnh bìa, xem/thích/bình luận/chia sẻ, link) | Display API (`video.list`, chỉ video công khai) | **Không** |
| Video chưa đăng (hàng chờ) | Bạn tải lên | Có: `data/pending/` (file video + file .json). Đăng xong thì tự xoá |
| Cài đặt | Bạn nhập | `data/settings.json` |
| Nhật ký thao tác | Tool ghi | `data/logs/YYYY-MM-DD.txt`, mỗi ngày 1 file |

### Các trang

| Trang | Làm được gì |
|---|---|
| **Tổng quan** | Thông tin kênh, tổng/trung bình lượt xem, thích, bình luận, tỉ lệ tương tác, top video, tình trạng hàng chờ, nhật ký hôm nay |
| **Video trên kênh** | Bảng hoặc lưới video, tìm kiếm, sắp xếp theo xem/thích/bình luận/chia sẻ/tương tác. Bấm 1 video để xem bằng **player TikTok nhúng (iframe)** kèm đầy đủ thông tin và link |
| **Hàng chờ đăng** | Kéo thả nhiều video, soạn caption, chèn bộ hashtag, chọn ai được xem, hẹn giờ, lên lịch hàng loạt, Đăng ngay / Thử lại |
| **Lịch đăng** | Theo tuần: video đã đăng (từ TikTok) và video đã lên lịch (từ hàng chờ) |
| **Nhật ký** | Xem nhật ký theo ngày, lọc theo mức và nguồn, **tải file .txt** |
| **Cài đặt** | Đăng nhập TikTok và xem quyền đang có, quyền xem mặc định, số video lấy mỗi lần, khoảng cách giữa 2 bài, số bài tối đa/ngày, bộ hashtag |

### Nhật ký thao tác

Mọi thao tác được ghi vào `data/logs/YYYY-MM-DD.txt` (1 file mỗi ngày, theo giờ máy chạy server):

```
2026-09-29 13:26:42 | INFO    | web:127.0.0.1 | upload     | Tải lên "Kaiju đại chiến" (0.1 MB) vào hàng chờ | pending=bb27…
2026-09-29 13:26:43 | INFO    | web:127.0.0.1 | edit       | Sửa "Gipsy Danger ra khơi": caption, quyền xem → Mọi người | pending=372d…
2026-09-29 13:26:47 | SUCCESS | scheduler | publish    | Đã đăng "Gipsy Danger ra khơi" lên TikTok (quyền xem: PUBLIC_TO_EVERYONE) | …
2026-09-29 13:28:22 | SUCCESS | system    | fetch      | Lấy dữ liệu kênh @gipsy.danger từ TikTok API: 128400 người theo dõi, 8/8 video |
```

Cột: thời gian · mức (INFO/SUCCESS/WARN/ERROR) · nguồn (`web:<IP>` = người dùng trên web,
`scheduler` = tự động đăng, `cli`, `system`) · thao tác · nội dung · đối tượng. Các lệnh CLI cũng
ghi vào cùng file.

### Bộ lập lịch

- Server kiểm tra mỗi 20 giây, mỗi lần đăng **tối đa 1** video đã tới giờ hẹn.
- Tôn trọng **khoảng cách tối thiểu** giữa 2 bài và **số bài tối đa mỗi ngày** (đếm từ nhật ký).
  Nút **Đăng ngay** bỏ qua hai giới hạn này.
- Đăng lỗi → video ở lại hàng chờ với trạng thái **Lỗi** kèm lý do; bấm **Thử lại** khi đã xử lý.
  Nếu TikTok báo giới hạn tần suất, video tự lùi lịch 15 phút.
- Không có `video.publish` → video được **gửi vào hộp nháp** TikTok; mở app để soạn caption và đăng.
- **Server phải đang chạy** thì mới tự đăng được.

Truy cập từ điện thoại cùng mạng Wi-Fi: đặt `HOST=0.0.0.0` và `ADMIN_PASSWORD=...` trong `.env`, rồi
vào `http://<IP máy tính>:8787`.

Phát triển giao diện (tự reload): chạy `npm run dev:server` và `npm run dev:web` ở 2 terminal, rồi
mở http://localhost:5173.

# CLI

```bash
node src/cli.mjs login     # đăng nhập OAuth
node src/cli.mjs whoami    # thông tin kênh, 5 video gần nhất, quyền đăng
```

## Đăng 1 video

```bash
node src/cli.mjs upload ./video.mp4 -c "Gipsy Danger #robot #fyp" -p SELF_ONLY
node src/cli.mjs upload ./video.mp4 --draft          # gửi vào hộp nháp, tự bấm Đăng trong app TikTok
```

Mặc định là `SELF_ONLY` (chỉ mình bạn xem); đổi bằng `-p` hoặc `DEFAULT_PRIVACY` trong `.env`.
Nếu token không có `video.publish`, tool tự gửi vào hộp nháp (caption và quyền xem soạn trong app).

## Tự động hoá bằng thư mục queue

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

## Giới hạn của TikTok

- Định dạng MP4, MOV hoặc WebM (khuyến nghị MP4/H.264), dung lượng tối đa 4GB, caption tối đa
  2200 ký tự.
- Tối đa khoảng 6 request init mỗi phút cho mỗi token, và mỗi creator chỉ đăng được một số
  video nhất định mỗi ngày (thường khoảng 15). Nên để `--interval` từ 60 phút trở lên.
- Thời lượng tối đa tuỳ tài khoản (`max_video_post_duration_sec` trong `whoami`).

## Test

```bash
npm test
```
