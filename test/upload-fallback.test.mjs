import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-upload-'))
process.env.TOKEN_FILE = path.join(dir, 'tokens.json')
process.env.TIKTOK_CLIENT_KEY = 'k'
process.env.TIKTOK_CLIENT_SECRET = 's'
fs.writeFileSync(
  process.env.TOKEN_FILE,
  JSON.stringify({
    access_token: 'tok',
    scope: 'user.info.basic,video.upload,video.publish',
    expires_at: Date.now() + 3_600_000,
    refresh_expires_at: Date.now() + 86_400_000,
  }),
)
const video = path.join(dir, 'clip.mp4')
fs.writeFileSync(video, Buffer.alloc(2048))

const { publishVideo } = await import('../src/upload.mjs')

test('app chưa duyệt + tài khoản công khai: tự chuyển sang gửi vào hộp nháp', async () => {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url)
    calls.push(u.pathname)
    const ok = (data) => new Response(JSON.stringify({ data, error: { code: 'ok' } }), { status: 200 })
    if (u.pathname === '/v2/post/publish/creator_info/query/') return ok({ privacy_level_options: ['SELF_ONLY'] })
    if (u.pathname === '/v2/post/publish/video/init/') {
      return new Response(
        JSON.stringify({ error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x', log_id: 'l' } }),
        { status: 403 },
      )
    }
    if (u.pathname === '/v2/post/publish/inbox/video/init/') return ok({ publish_id: 'v_inbox_1', upload_url: 'https://upload.example/put' })
    if (u.hostname === 'upload.example') return new Response(null, { status: 201 })
    if (u.pathname === '/v2/post/publish/status/fetch/') return ok({ status: 'SEND_TO_USER_INBOX' })
    throw new Error(`unexpected ${url}`)
  }
  const warn = console.warn
  console.warn = () => {}
  const log = console.log
  console.log = () => {}
  try {
    const result = await publishVideo({ file: video, caption: 'hi', privacy: 'SELF_ONLY' })
    assert.equal(result.mode, 'inbox')
    assert.equal(result.status, 'SEND_TO_USER_INBOX')
    assert.ok(calls.includes('/v2/post/publish/video/init/'))
    assert.ok(calls.includes('/v2/post/publish/inbox/video/init/'))
  } finally {
    console.warn = warn
    console.log = log
  }
})
