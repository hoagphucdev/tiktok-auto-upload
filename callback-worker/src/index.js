/**
 * Cloudflare Worker cho TikTok:
 *   GET  /callback        Redirect URI của Login Kit — hiện mã đăng nhập (và giữ 10 phút trong KV để CLI tự lấy)
 *   GET  /callback/poll   CLI hỏi mã theo `state` (lấy 1 lần rồi xoá)
 *   POST /webhook         Nhận sự kiện TikTok, kiểm tra chữ ký bằng client secret, lưu vào KV
 *   GET  /webhook         Trả "ok" (để kiểm tra URL)
 *   GET  /events          Danh sách sự kiện gần đây (cần header Authorization: Bearer <EVENTS_TOKEN>)
 *
 * Biến môi trường (wrangler secret put …):
 *   TIKTOK_CLIENT_SECRET  để kiểm tra chữ ký webhook (bắt buộc, trừ khi ALLOW_UNSIGNED=1)
 *   EVENTS_TOKEN          mật khẩu cho GET /events
 * KV binding (tuỳ chọn nhưng nên có): TIKTOK_KV
 */

const CODE_TTL = 600 // giây
const EVENT_TTL = 7 * 86400
const SIGNATURE_TOLERANCE = 300 // giây lệch cho phép giữa TikTok và Worker
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmacHex(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * TikTok ký webhook bằng header `TikTok-Signature: t=<unix>,s=<hex>`,
 * với s = HMAC-SHA256(client_secret, `${t}.${raw_body}`).
 */
export async function verifySignature(header, rawBody, secret, now = Date.now()) {
  if (!header) return { ok: false, reason: 'missing signature' }
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const t = Number(parts.t)
  if (!parts.t || !parts.s || !Number.isFinite(t)) return { ok: false, reason: 'malformed signature' }
  if (Math.abs(now / 1000 - t) > SIGNATURE_TOLERANCE) return { ok: false, reason: 'stale timestamp' }
  const expected = await hmacHex(secret, `${parts.t}.${rawBody}`)
  return safeEqual(expected, parts.s.toLowerCase()) ? { ok: true } : { ok: false, reason: 'bad signature' }
}

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light dark;--bg:#f6f6f8;--card:#fff;--text:#16161a;--muted:#6b6b76;--accent:#fe2c55;--border:#e3e3e8}
  @media (prefers-color-scheme:dark){:root{--bg:#0f0f12;--card:#18181d;--text:#ececf1;--muted:#9a9aa6;--border:#2c2c35}}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
  main{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:560px;width:100%}
  h1{font-size:20px;margin:0 0 8px} p{color:var(--muted)} .row{display:flex;gap:8px}
  input{flex:1;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;font:13px ui-monospace,monospace}
  button{padding:8px 14px;border-radius:8px;border:0;background:var(--accent);color:#fff;font-weight:600;cursor:pointer}
</style></head><body><main>${body}</main></body></html>`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
  })
}

async function handleCallback(url, env) {
  const q = url.searchParams
  const error = q.get('error')
  if (error) {
    return page(
      'Đăng nhập thất bại',
      `<h1>Đăng nhập TikTok thất bại</h1><p>${escapeHtml(q.get('error_description') || error)}</p><p>Quay lại terminal và chạy lại <code>login --api</code>.</p>`,
      400,
    )
  }
  const code = q.get('code')
  const state = q.get('state') || ''
  if (!code) return page('Thiếu mã', '<h1>Không có mã đăng nhập</h1><p>Trang này là Redirect URI của TikTok Login Kit.</p>', 400)

  let stored = false
  if (env.TIKTOK_KV && STATE_RE.test(state)) {
    await env.TIKTOK_KV.put(`code:${state}`, JSON.stringify({ code, scopes: q.get('scopes') || '', at: Date.now() }), {
      expirationTtl: CODE_TTL,
    })
    stored = true
  }

  return page(
    'Đăng nhập thành công',
    `<h1>Đăng nhập TikTok thành công ✓</h1>
${stored ? '<p>Tool trên máy sẽ <b>tự nhận mã</b> trong vài giây — có thể đóng tab này. Nếu terminal vẫn chờ, copy URL dưới và dán vào.</p>' : '<p>Copy URL dưới và dán vào terminal đang chạy <code>login --api</code> (mã chỉ dùng được vài phút).</p>'}
<div class="row"><input id="u" readonly value="${escapeHtml(url.href)}"><button id="c" type="button">Copy</button></div>
<script>document.getElementById('c').onclick=async()=>{const i=document.getElementById('u');i.select();try{await navigator.clipboard.writeText(i.value)}catch{document.execCommand('copy')}document.getElementById('c').textContent='Đã copy'}</script>`,
  )
}

async function handlePoll(url, env) {
  if (!env.TIKTOK_KV) return json({ error: 'KV chưa được cấu hình trên Worker' }, 501)
  const state = url.searchParams.get('state') || ''
  if (!STATE_RE.test(state)) return json({ error: 'state không hợp lệ' }, 400)
  const key = `code:${state}`
  const value = await env.TIKTOK_KV.get(key)
  if (!value) return json({ pending: true }, 202)
  await env.TIKTOK_KV.delete(key) // chỉ đọc được 1 lần
  return json(JSON.parse(value))
}

async function handleWebhook(request, env, ctx) {
  const raw = await request.text()
  let verified = false
  if (env.TIKTOK_CLIENT_SECRET) {
    const check = await verifySignature(request.headers.get('TikTok-Signature'), raw, env.TIKTOK_CLIENT_SECRET)
    if (!check.ok && env.ALLOW_UNSIGNED !== '1') return json({ error: check.reason }, 401)
    verified = check.ok
  } else if (env.ALLOW_UNSIGNED !== '1') {
    return json({ error: 'Worker chưa đặt TIKTOK_CLIENT_SECRET' }, 500)
  }

  let body
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return json({ error: 'body không phải JSON' }, 400)
  }
  let content = body.content
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      // giữ nguyên chuỗi
    }
  }
  const event = {
    receivedAt: new Date().toISOString(),
    event: body.event || 'unknown',
    createTime: body.create_time ?? null,
    userOpenId: body.user_openid ?? null,
    clientKey: body.client_key ?? null,
    content,
    verified,
  }
  if (env.TIKTOK_KV) {
    // Key tăng dần theo thời gian để liệt kê đúng thứ tự
    const key = `event:${String(Date.now()).padStart(15, '0')}:${crypto.randomUUID().slice(0, 8)}`
    const write = env.TIKTOK_KV.put(key, JSON.stringify(event), { expirationTtl: EVENT_TTL })
    ctx?.waitUntil ? ctx.waitUntil(write) : await write
  }
  // TikTok cần 200 thật nhanh, nếu không sẽ gửi lại
  return json({ ok: true })
}

async function handleEvents(request, url, env) {
  if (!env.EVENTS_TOKEN) return json({ error: 'Worker chưa đặt EVENTS_TOKEN' }, 404)
  const auth = request.headers.get('Authorization') || ''
  if (!safeEqual(auth, `Bearer ${env.EVENTS_TOKEN}`)) return json({ error: 'unauthorized' }, 401)
  if (!env.TIKTOK_KV) return json({ error: 'KV chưa được cấu hình trên Worker' }, 501)

  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
  const keys = []
  let cursor
  do {
    const page = await env.TIKTOK_KV.list({ prefix: 'event:', cursor })
    keys.push(...page.keys.map((k) => k.name))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  const newest = keys.sort().reverse().slice(0, limit)
  const events = (await Promise.all(newest.map((k) => env.TIKTOK_KV.get(k)))).filter(Boolean).map((v) => JSON.parse(v))
  return json({ events })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (path === '/callback' && request.method === 'GET') return await handleCallback(url, env)
      if (path === '/callback/poll' && request.method === 'GET') return await handlePoll(url, env)
      if (path === '/webhook' && request.method === 'POST') return await handleWebhook(request, env, ctx)
      if (path === '/webhook' && request.method === 'GET') return new Response('ok', { headers: { 'Cache-Control': 'no-store' } })
      if (path === '/events' && request.method === 'GET') return await handleEvents(request, url, env)
      if (path === '/') return new Response('TikTok callback worker: /callback, /webhook', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      return json({ error: 'not found' }, 404)
    } catch (err) {
      console.error(err)
      return json({ error: 'internal error' }, 500)
    }
  },
}
