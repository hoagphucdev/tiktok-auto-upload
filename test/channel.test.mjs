import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

// Trang kênh TikTok giả: dữ liệu hồ sơ nhúng trong #__UNIVERSAL_DATA_FOR_REHYDRATION__,
// danh sách video tải qua /api/post/item_list/ khi cuộn — giống trang thật.
const item = (id, extra = {}) => ({
  id: String(id),
  desc: `Video ${id} #robot`,
  createTime: 1790000000 + id * 3600,
  video: { duration: 15 + id, width: 1080, height: 1920, cover: `https://p16.example/cover-${id}.jpg` },
  stats: { playCount: 1000 * id, diggCount: 100 * id, commentCount: 10 * id, shareCount: id, collectCount: 2 * id },
  statsV2: { playCount: String(1000 * id), diggCount: String(100 * id), commentCount: String(10 * id), shareCount: String(id), collectCount: String(2 * id) },
  textExtra: [{ hashtagName: 'robot' }],
  music: { title: 'nhạc nền', authorName: 'demo' },
  ...extra,
})
const PAGES = [
  [item(5, { isPinnedItem: true }), item(4), item(3)],
  [item(2, { privateItem: true }), item(1)],
]

function startFakeTikTok() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/@demo') {
      const data = {
        __DEFAULT_SCOPE__: {
          'webapp.user-detail': {
            statusCode: 0,
            userInfo: {
              user: { id: '42', uniqueId: 'demo', nickname: 'Demo Kênh', signature: 'bio', verified: false, avatarLarger: 'https://p16.example/a.jpg' },
              stats: { followerCount: 1234, followingCount: 5, heartCount: 99999, videoCount: 5 },
            },
          },
        },
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><body style="height:5000px">
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script>
<script>
  let cursor = 0, loading = false
  async function more() {
    if (loading || cursor >= ${PAGES.length}) return
    loading = true
    await fetch('/api/post/item_list/?cursor=' + cursor)
    cursor++; loading = false
  }
  more(); addEventListener('wheel', more)
</script></body>`)
    } else if (url.pathname === '/api/post/item_list/') {
      const c = Number(url.searchParams.get('cursor'))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ itemList: PAGES[c] || [], hasMore: c < PAGES.length - 1 }))
    } else {
      res.writeHead(404).end()
    }
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)))
}

// Cần trình duyệt: CHROMIUM_PATH hoặc Chromium do "npm run setup" cài
async function browserPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  try {
    return (await import('playwright')).chromium.executablePath()
  } catch {
    return ''
  }
}
const exe = await browserPath()
const skip = exe && fs.existsSync(exe) ? false : 'chưa cài Chromium (chạy npm run setup)'

test('fetchChannel: đọc hồ sơ + cuộn lấy đủ video từ trang TikTok', { skip }, async () => {
  const server = await startFakeTikTok()
  process.env.TIKTOK_PROFILE_URL = `http://127.0.0.1:${server.address().port}/@{username}`
  process.env.HEADLESS = '1'
  process.env.BROWSER_PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-profile-'))
  const { fetchChannel } = await import('../src/channel.mjs')
  try {
    const data = await fetchChannel({ username: '@demo', maxVideos: 50, timeoutMs: 30_000 })
    assert.equal(data.user.username, 'demo')
    assert.equal(data.user.nickname, 'Demo Kênh')
    assert.deepEqual(data.user.stats, { followers: 1234, following: 5, likes: 99999, videos: 5 })
    assert.deepEqual(data.videos.map((v) => v.id), ['5', '4', '3', '2', '1'])
    const [pinned, , , priv] = data.videos
    assert.equal(pinned.pinned, true)
    assert.equal(priv.private, true)
    assert.deepEqual(pinned.stats, { views: 5000, likes: 500, comments: 50, shares: 5, saves: 10 })
    assert.equal(pinned.url, 'https://www.tiktok.com/@demo/video/5')
    assert.match(pinned.embedUrl, /^https:\/\/www\.tiktok\.com\/player\/v1\/5/)
    assert.deepEqual(pinned.hashtags, ['robot'])
    assert.equal(pinned.duration, 20)
    assert.equal(data.complete, true)
  } finally {
    server.close()
  }
})
