import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Nhật ký ghi vào thư mục tạm (phải đặt trước khi import logger)
process.env.LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-logs-'))
const { createApp } = await import('../server/app.mjs')
const { createChannelCache } = await import('../server/channel-cache.mjs')
const { createPendingStore, createSettingsStore } = await import('../server/store.mjs')
const { createScheduler, pickNext, publishHistory } = await import('../server/scheduler.mjs')
const { localDay, logAction, readLog, listLogDays } = await import('../src/logger.mjs')

const MIN = 60_000
const now = Date.parse('2026-10-01T12:00:00Z')
const v = (over) => ({ status: 'scheduled', scheduledAt: new Date(now - MIN).toISOString(), force: false, ...over })
const noHistory = { publishedToday: 0, lastPublishedAt: null }

test('pickNext: chọn bài tới giờ sớm nhất, bỏ qua bài chưa tới giờ', () => {
  const a = v({ id: 'a', scheduledAt: new Date(now - 5 * MIN).toISOString() })
  const b = v({ id: 'b', scheduledAt: new Date(now - 10 * MIN).toISOString() })
  const c = v({ id: 'c', scheduledAt: new Date(now + MIN).toISOString() })
  assert.equal(pickNext([a, b, c], { gapMinutes: 0 }, noHistory, now).video.id, 'b')
  assert.deepEqual(pickNext([c], {}, noHistory, now), {})
})

test('pickNext: tôn trọng khoảng cách và giới hạn/ngày, trừ bài "đăng ngay"', () => {
  const history = { publishedToday: 1, lastPublishedAt: new Date(now - 10 * MIN).toISOString() }
  const due = v({ id: 'due' })
  assert.equal(pickNext([due], { gapMinutes: 60 }, history, now).blocked, 'gap')
  assert.equal(pickNext([due], { dailyLimit: 1 }, history, now).blocked, 'daily_limit')
  const forced = v({ id: 'forced', force: true, scheduledAt: new Date(now).toISOString() })
  assert.equal(pickNext([due, forced], { gapMinutes: 60, dailyLimit: 1 }, history, now).video.id, 'forced')
})

test('logger: ghi .txt theo ngày, 1 dòng/mục, đọc lại được; lịch sử đăng lấy từ log', () => {
  logAction({ level: 'success', actor: 'scheduler', action: 'publish', message: 'Đã đăng "A"\ncó | ký tự lạ', target: 'x' })
  const file = path.join(process.env.LOG_DIR, `${localDay()}.txt`)
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  assert.match(lines.at(-1), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \| SUCCESS \| scheduler \| publish +\| Đã đăng "A" có \/ ký tự lạ \| x$/)
  assert.equal(readLog()[0].message, 'Đã đăng "A" có / ký tự lạ')
  assert.equal(listLogDays()[0].day, localDay())
  const h = publishHistory()
  assert.ok(h.publishedToday >= 1)
  assert.ok(Date.now() - Date.parse(h.lastPublishedAt) < 5000)
})

async function startServer({ publish = async () => ({ status: 'PUBLISH_COMPLETE' }), fetchChannel } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-server-'))
  const store = createPendingStore(dir)
  const settings = createSettingsStore(dir, { maxVideos: 100, privacy: 'SELF_ONLY', gapMinutes: 0, dailyLimit: 0, paused: false, hashtagSets: [] })
  const lock = { busy: null }
  let fetches = 0
  const channel = createChannelCache({
    fetchChannel: async (opts) => {
      fetches++
      return fetchChannel ? fetchChannel(opts) : { user: { username: 'demo', stats: {} }, videos: [], fetchedAt: new Date().toISOString() }
    },
    getSettings: settings.get,
  })
  const scheduler = createScheduler({ store, getSettings: settings.get, publish, lock, intervalMs: 60_000, history: () => noHistory })
  let resolveLogin
  const publisher = {
    authStatus: () => ({ loggedIn: false }),
    startLogin: () => ({ url: 'https://www.tiktok.com/v2/auth/authorize/?x=1', done: new Promise((r) => (resolveLogin = r)) }),
  }
  const app = createApp({ store, settings, channel, scheduler, lock, publisher })
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s))
  })
  const base = `http://127.0.0.1:${server.address().port}/api`
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      ...(body instanceof FormData ? { body } : body && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    })
    const text = await res.text()
    return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
  }
  return { dir, store, scheduler, call, fetches: () => fetches, finishLogin: (t) => resolveLogin(t), close: () => server.close() }
}

const uploadForm = (name = 'Video thử.mp4', fields = {}) => {
  const form = new FormData()
  form.append('file', new Blob([Buffer.alloc(1024)], { type: 'video/mp4' }), name)
  for (const [k, val] of Object.entries(fields)) form.append(k, val)
  return form
}

test('API: tải lên → sửa → đăng ngay → rời hàng chờ (không lưu lại sau khi đăng)', async () => {
  const published = []
  const srv = await startServer({
    publish: async (video) => {
      published.push(video.caption)
      return { status: 'PUBLISH_COMPLETE' }
    },
  })
  try {
    const up = await srv.call('POST', '/pending', uploadForm('Video thử.mp4', { caption: 'hello #fyp', tags: 'a, b' }))
    assert.equal(up.status, 201)
    assert.equal(up.body.title, 'Video thử')
    assert.deepEqual(up.body.tags, ['a', 'b'])
    assert.ok(fs.existsSync(path.join(srv.dir, 'pending', `${up.body.id}.json`)))

    assert.equal((await srv.call('POST', '/pending', uploadForm('x.exe'))).status, 400)

    const edit = await srv.call('PATCH', `/pending/${up.body.id}`, { caption: 'mới #robot', privacy: 'PUBLIC_TO_EVERYONE' })
    assert.equal(edit.body.caption, 'mới #robot')
    assert.equal((await srv.call('PATCH', `/pending/${up.body.id}`, { privacy: 'NOPE' })).status, 400)
    await srv.call('PATCH', `/pending/${up.body.id}`, { status: 'scheduled', scheduledAt: '2999-01-01T00:00:00Z' })
    assert.equal((await srv.call('PATCH', `/pending/${up.body.id}`, { scheduledAt: '' })).status, 400)

    await srv.call('POST', `/pending/${up.body.id}/publish`)
    await srv.scheduler.tick()
    assert.deepEqual(published, ['mới #robot'])
    assert.equal((await srv.call('GET', `/pending/${up.body.id}`)).status, 404)
    assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'pending')), [])

    const log = (await srv.call('GET', `/logs/${localDay()}`)).body
    const actions = log.map((e) => `${e.actor.split(':')[0]}/${e.action}`)
    for (const a of ['web/upload', 'web/edit', 'web/publish', 'scheduler/publish']) assert.ok(actions.includes(a), a)
    assert.ok(log.some((e) => e.message.includes('quyền xem → Mọi người')))

    const dl = await srv.call('GET', `/logs/${localDay()}/download`)
    assert.equal(dl.status, 200)
    assert.match(dl.body, /\| web:127\.0\.0\.1 \| upload/)
    assert.equal((await srv.call('GET', '/logs/../../etc/passwd')).status, 404)
    assert.equal((await srv.call('GET', '/logs/2026-13-99x')).status, 400)
  } finally {
    srv.close()
  }
})

test('API: lên lịch hàng loạt, lỗi khi đăng giữ lại trong hàng chờ', async () => {
  const srv = await startServer({
    publish: async () => {
      throw new Error('Không thấy nút Post')
    },
  })
  try {
    const ids = []
    for (const n of ['a.mp4', 'b.mp4', 'c.mp4']) ids.push((await srv.call('POST', '/pending', uploadForm(n))).body.id)
    const start = new Date(Date.now() - 1000).toISOString()
    assert.equal((await srv.call('POST', '/pending/bulk', { ids, action: 'schedule', startAt: start, intervalMinutes: 30 })).body.count, 3)
    const times = (await srv.call('GET', '/pending?status=scheduled')).body.map((x) => Date.parse(x.scheduledAt)).sort()
    assert.equal(times[1] - times[0], 30 * MIN)

    await srv.scheduler.tick()
    const failed = (await srv.call('GET', '/pending?status=failed')).body
    assert.equal(failed.length, 1)
    assert.match(failed[0].lastError, /Không thấy nút Post/)

    await srv.call('POST', '/pending/bulk', { ids, action: 'delete' })
    assert.equal((await srv.call('GET', '/pending')).body.length, 0)
    assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'pending')), [])
  } finally {
    srv.close()
  }
})

test('API: dữ liệu kênh lấy từ TikTok, cache ngắn trong RAM, refresh bắt buộc lấy lại', async () => {
  const srv = await startServer({
    fetchChannel: async ({ maxVideos }) => ({
      user: { username: 'demo', stats: { followers: 10, videos: maxVideos } },
      videos: [{ id: '1', caption: 'x' }],
      fetchedAt: new Date().toISOString(),
    }),
  })
  try {
    const a = await srv.call('GET', '/channel')
    assert.equal(a.body.user.username, 'demo')
    assert.equal((await srv.call('GET', '/channel')).body.cached, true)
    assert.equal(srv.fetches(), 1)
    await srv.call('GET', '/channel?refresh=1')
    assert.equal(srv.fetches(), 2)
    assert.equal((await srv.call('GET', '/channel/videos/1')).body.caption, 'x')
    assert.equal((await srv.call('GET', '/channel/videos/2')).status, 404)
    // Không có file dữ liệu kênh nào được ghi xuống đĩa
    assert.deepEqual(fs.readdirSync(srv.dir).sort(), ['pending', 'settings.json'])
  } finally {
    srv.close()
  }
})

test('API: cài đặt được kiểm tra hợp lệ', async () => {
  const srv = await startServer()
  try {
    const ok = await srv.call('PUT', '/settings', { maxVideos: 9999, gapMinutes: '90', paused: 1, hashtagSets: [{ name: 'Robot', tags: '#robot' }, { name: '' }] })
    assert.equal(ok.body.maxVideos, 500)
    assert.equal(ok.body.gapMinutes, 90)
    assert.equal(ok.body.paused, true)
    assert.equal(ok.body.hashtagSets.length, 1)
    assert.equal((await srv.call('PUT', '/settings', { privacy: 'hack' })).status, 400)
    // Khoá lạ bị bỏ qua, không lưu
    assert.equal((await srv.call('PUT', '/settings', { method: 'browser' })).body.method, undefined)
  } finally {
    srv.close()
  }
})

test('API: đăng nhập OAuth từ web trả link, ghi nhật ký khi xong', async () => {
  const srv = await startServer()
  try {
    const start = await srv.call('POST', '/auth/login')
    assert.match(start.body.url, /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\//)
    assert.equal((await srv.call('GET', '/auth/status')).body.pending, true)
    srv.finishLogin({ scope: 'user.info.basic,video.upload' })
    await new Promise((r) => setTimeout(r, 50))
    assert.equal((await srv.call('GET', '/auth/status')).body.pending, false)
    const log = (await srv.call('GET', `/logs/${localDay()}`)).body
    assert.ok(log.some((e) => e.action === 'login' && e.level === 'success' && e.message.includes('video.upload')))
  } finally {
    srv.close()
  }
})
