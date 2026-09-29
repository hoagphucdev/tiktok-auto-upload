import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import worker, { verifySignature } from '../callback-worker/src/index.js'

process.env.TIKTOK_CLIENT_KEY ||= 'k'
process.env.TIKTOK_CLIENT_SECRET ||= 's'
const { pollWorker } = await import('../src/auth.mjs')

// KV giả giống API của Cloudflare KV
function fakeKV() {
  const m = new Map()
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  }
}
const SECRET = 'shh-client-secret'
const env = () => ({ TIKTOK_KV: fakeKV(), TIKTOK_CLIENT_SECRET: SECRET, EVENTS_TOKEN: 'evt' })
const call = (e, path, init) => worker.fetch(new Request(`https://w.example${path}`, init), e, { waitUntil: (p) => p })
const sign = (body, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},s=${crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`

test('callback: hiện mã, escape HTML, lưu KV; poll lấy 1 lần', async () => {
  const e = env()
  const state = 'a'.repeat(32)
  const res = await call(e, `/callback?code=ABC%3Cscript%3E&state=${state}&scopes=user.info.basic`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes('ABC%3Cscript%3E') && !html.includes('ABC<script>'))
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/)

  const poll = await call(e, `/callback/poll?state=${state}`)
  assert.equal(poll.status, 200)
  assert.equal((await poll.json()).code, 'ABC<script>')
  assert.equal((await call(e, `/callback/poll?state=${state}`)).status, 202)
  assert.equal((await call(e, '/callback/poll?state=bad!')).status, 400)
  assert.equal((await call({}, `/callback/poll?state=${state}`)).status, 501)
})

test('callback: báo lỗi khi TikTok trả error', async () => {
  const res = await call(env(), '/callback?error=access_denied&error_description=User%20c%C3%A1ncelled')
  assert.equal(res.status, 400)
  assert.match(await res.text(), /User cáncelled/)
})

test('webhook: chỉ nhận request có chữ ký hợp lệ, lưu sự kiện; /events cần token', async () => {
  const e = env()
  const body = JSON.stringify({
    client_key: 'ck',
    event: 'post.publish.complete',
    create_time: 1790000000,
    user_openid: 'u1',
    content: JSON.stringify({ publish_id: 'p1', publish_type: 'DIRECT_PUBLISH' }),
  })
  const post = (headers) => call(e, '/webhook', { method: 'POST', body, headers })
  assert.equal((await post({})).status, 401)
  assert.equal((await post({ 'TikTok-Signature': 't=1,s=00' })).status, 401)
  assert.equal((await post({ 'TikTok-Signature': sign(body, Math.floor(Date.now() / 1000) - 3600) })).status, 401)
  assert.equal((await post({ 'TikTok-Signature': sign(body) })).status, 200)

  assert.equal((await call(e, '/events')).status, 401)
  const list = await call(e, '/events', { headers: { Authorization: 'Bearer evt' } })
  const { events } = await list.json()
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'post.publish.complete')
  assert.equal(events[0].content.publish_id, 'p1')
  assert.equal(events[0].verified, true)
  assert.equal((await call(e, '/webhook')).status, 200)
})

test('verifySignature: sai body thì từ chối', async () => {
  const header = sign('{"a":1}')
  assert.equal((await verifySignature(header, '{"a":1}', SECRET)).ok, true)
  assert.equal((await verifySignature(header, '{"a":2}', SECRET)).ok, false)
})

test('CLI tự nhận mã từ Worker (poll)', async () => {
  const e = env()
  // Cầu nối HTTP → worker.fetch để CLI gọi thật qua mạng
  const server = http.createServer(async (req, res) => {
    const r = await call(e, req.url)
    res.writeHead(r.status, Object.fromEntries(r.headers))
    res.end(await r.text())
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const redirect = new URL(`http://127.0.0.1:${server.address().port}/callback`)
  const state = crypto.randomBytes(16).toString('hex')
  const ac = new AbortController()
  try {
    setTimeout(() => call(e, `/callback?code=CODE123&state=${state}`), 500)
    const code = await Promise.race([pollWorker(redirect, state, ac.signal), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))])
    assert.equal(code, 'CODE123')
  } finally {
    ac.abort()
    server.close()
  }
})
