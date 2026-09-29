# TikTok callback Worker (Cloudflare)

Worker nhỏ cho app TikTok, gồm 2 endpoint chính:

| Endpoint | Dùng cho | Việc làm |
|---|---|---|
| `GET /callback` | **Login Kit → Redirect URI** | Nhận `code` sau khi đăng nhập, hiện trang "thành công" kèm nút Copy, và (nếu có KV) giữ mã 10 phút để CLI **tự nhận** — không phải copy/dán |
| `POST /webhook` | **Webhooks → Callback URL** | Kiểm tra chữ ký `TikTok-Signature` bằng client secret, lưu sự kiện 7 ngày vào KV (đăng xong, đăng lỗi, thu hồi quyền…) |

Phụ: `GET /callback/poll?state=…` (CLI hỏi mã), `GET /webhook` (trả `ok` để kiểm tra URL),
`GET /events` (xem sự kiện, cần `Authorization: Bearer <EVENTS_TOKEN>`).

## Deploy

```bash
cd callback-worker
npx wrangler login                              # đăng nhập Cloudflare (1 lần)

# KV: để CLI tự nhận mã và để lưu sự kiện webhook
npx wrangler kv namespace create TIKTOK_KV      # copy "id" in ra
# → mở wrangler.toml, bỏ dấu # ở khối [[kv_namespaces]] và dán id vào

npx wrangler secret put TIKTOK_CLIENT_SECRET    # dán Client secret của app TikTok
npx wrangler secret put EVENTS_TOKEN            # tự đặt 1 chuỗi ngẫu nhiên dài
npx wrangler deploy
```

Wrangler in ra địa chỉ, ví dụ `https://tiktok-callback.<tên-bạn>.workers.dev`.

## Khai báo trên developers.tiktok.com

- **Login Kit → Redirect URI → tab Web**: `https://tiktok-callback.<tên-bạn>.workers.dev/callback`
- **Webhooks → Callback URL**: `https://tiktok-callback.<tên-bạn>.workers.dev/webhook` → bấm **Test URL**

Nếu dùng client key **Sandbox**, khai báo ở phần Sandbox của app.

## Trên máy (`.env` của tiktok-auto-upload)

```env
TIKTOK_REDIRECT_URI=https://tiktok-callback.<tên-bạn>.workers.dev/callback
TIKTOK_USE_PKCE=1
```

Rồi chạy `node src/cli.mjs login --api`, mở link in ra, cấp quyền. Trang Worker hiện "thành công"
và terminal tự nhận mã sau vài giây. Nếu Worker chưa có KV, copy URL trên trang đó và dán vào
terminal.

## An toàn

- Mã đăng nhập vô dụng nếu thiếu client secret **và** mã PKCE (chỉ nằm trên máy bạn); Worker xoá mã
  ngay khi CLI lấy, và tự hết hạn sau 10 phút.
- Webhook không có chữ ký hợp lệ (hoặc lệch giờ quá 5 phút) bị từ chối `401`. Nếu nút **Test URL**
  của TikTok báo lỗi vì request thử không được ký, tạm đặt `npx wrangler secret put ALLOW_UNSIGNED`
  = `1`, test xong thì xoá (`npx wrangler secret delete ALLOW_UNSIGNED`).
- Xem log trực tiếp: `npx wrangler tail`.
