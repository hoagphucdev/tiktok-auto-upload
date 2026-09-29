import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Token giả (còn hạn) để không phải đăng nhập thật
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-api-'))
process.env.TOKEN_FILE = path.join(dir, 'tokens.json')
process.env.TIKTOK_CLIENT_KEY = 'k'
process.env.TIKTOK_CLIENT_SECRET = 's'
const writeTokens = (scope) =>
  fs.writeFileSync(
    process.env.TOKEN_FILE,
    JSON.stringify({ access_token: 'tok', scope, expires_at: Date.now() + 3_600_000, refresh_expires_at: Date.now() + 86_400_000 }),
  )

const { fetchChannelApi } = await import('../src/channel-api.mjs')

const video = (id) => ({
  id: String(id),
  title: '',
  video_description: `Video ${id} #robot #fyp`,
  duration: 10 + id,
  cover_image_url: `https://p16/c${id}.jpg`,
  share_url: `https://www.tiktok.com/@demo/video/${id}`,
  create_time: 1790000000 + id,
  width: 1080,
  height: 1920,
  view_count: 100 * id,
  like_count: 10 * id,
  comment_count: id,
  share_count: 2 * id,
})

function mockFetch() {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const u = new URL(url)
    let data
    if (u.pathname === '/v2/user/info/') {
      data = {
        user: { open_id: 'o1', display_name: 'Demo', avatar_url: 'a', username: 'demo', follower_count: 50, following_count: 3, likes_count: 900, video_count: 25 },
      }
    } else if (u.pathname === '/v2/video/list/') {
      const body = JSON.parse(init.body)
      const start = body.cursor || 0
      const n = Math.min(body.max_count, 25 - start)
      data = { videos: Array.from({ length: n }, (_, i) => video(start + i + 1)), cursor: start + n, has_more: start + n < 25 }
    }
    return new Response(JSON.stringify({ data, error: { code: 'ok' } }), { status: 200 })
  }
  return calls
}

test('fetchChannelApi: đọc tài khoản + phân trang video, chỉ xin trường có scope', async () => {
  writeTokens('user.info.basic,user.info.profile,user.info.stats,video.list')
  const calls = mockFetch()
  const data = await fetchChannelApi({ maxVideos: 22 })
  assert.equal(data.source, 'api')
  assert.equal(data.user.username, 'demo')
  assert.deepEqual(data.user.stats, { followers: 50, following: 3, likes: 900, videos: 25 })
  assert.equal(data.videos.length, 22)
  assert.equal(data.complete, false)
  const v = data.videos[0]
  assert.deepEqual(v.stats, { views: 100, likes: 10, comments: 1, shares: 2, saves: null })
  assert.deepEqual(v.hashtags, ['robot', 'fyp'])
  assert.equal(v.url, 'https://www.tiktok.com/@demo/video/1')
  assert.match(v.embedUrl, /player\/v1\/1/)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok')
  // 2 trang: 20 + 2
  assert.deepEqual(calls.filter((c) => c.url.includes('/video/list/')).map((c) => JSON.parse(c.init.body).max_count), [20, 2])
})

test('fetchChannelApi: thiếu scope thì báo rõ, không gửi trường bị cấm', async () => {
  writeTokens('user.info.basic,video.upload')
  const calls = mockFetch()
  const data = await fetchChannelApi()
  assert.equal(data.user.nickname, 'Demo')
  assert.deepEqual(data.videos, [])
  assert.ok(data.warnings.some((w) => w.includes('video.list')))
  assert.ok(data.warnings.some((w) => w.includes('user.info.stats')))
  assert.equal(calls.filter((c) => c.url.includes('/video/list/')).length, 0)
  const fields = new URL(calls[0].url).searchParams.get('fields').split(',')
  assert.ok(!fields.includes('follower_count'))
  assert.ok(!fields.includes('username'))
})
