# TikTok Auto Uploader

CLI Node.js (không cần cài thư viện) để tự động đăng video lên TikTok qua
**Content Posting API chính thức**. Tool hỗ trợ đăng 1 video, đăng hàng loạt từ thư mục, đăng
theo chu kỳ và hẹn giờ.

## 1. Chuẩn bị app TikTok (làm 1 lần)

1. Vào https://developers.tiktok.com → **Manage apps** → tạo app.
2. Thêm product **Login Kit** và **Content Posting API** (bật *Direct Post* nếu muốn đăng thẳng).
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`.
4. Khai báo **Redirect URI**, ví dụ `http://localhost:3455/callback` (app dạng Desktop) hoặc URL
   https của bạn (app dạng Web).
5. Lấy **Client key** và **Client secret**.

> ⚠️ App **chưa được TikTok audit** chỉ đăng được video ở chế độ `SELF_ONLY` (riêng tư), và chỉ
> cho các tài khoản đã thêm vào mục *Sandbox / Target users*. Muốn đăng công khai, bạn phải gửi
> app cho TikTok audit.

## 2. Cài đặt

```bash
cd tools/tiktok-uploader
cp .env.example .env      # rồi điền TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI
node src/cli.mjs login    # mở link in ra, cấp quyền → token lưu vào .tokens.json
node src/cli.mjs whoami   # kiểm tra tài khoản & các mức privacy được phép
```

Token tự refresh (access token sống 24h, refresh token sống 365 ngày).

## 3. Đăng 1 video

```bash
node src/cli.mjs upload ./video.mp4 -c "Gipsy Danger #robot #fyp" -p SELF_ONLY
node src/cli.mjs upload ./video.mp4 --draft          # gửi vào nháp, tự bấm đăng trong app TikTok
```

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
