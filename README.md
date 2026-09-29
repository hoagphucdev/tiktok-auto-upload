# TikTok Auto Uploader

CLI Node.js tự động đăng video lên TikTok: đăng 1 video, đăng hàng loạt từ thư mục, đăng theo chu
kỳ và hẹn giờ. Có 2 cách chạy:

| Cách | Cần key? | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **browser** (mặc định) | Không | Cài là chạy, đăng công khai được ngay | Phụ thuộc giao diện TikTok Studio, TikTok đổi giao diện thì có thể phải sửa selector |
| **api** (`--api`) | Có | Ổn định, chính thức | Phải tạo app; app chưa audit chỉ đăng được video riêng tư |

## 1. Cách không cần key (trình duyệt)

Tool mở Chromium bằng Playwright và thao tác trên trang upload của TikTok Studio thay bạn, giống
như bạn tự bấm tay. Bạn đăng nhập **một lần**, phiên đăng nhập được lưu trong `.browser-profile/`.

```bash
cd tools/tiktok-uploader
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
0 */3 * * * cd /path/to/tools/tiktok-uploader && node src/cli.mjs queue --max 1 >> cron.log 2>&1
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
