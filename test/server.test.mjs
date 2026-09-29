import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../server/app.mjs'
import { createDb } from '../server/db.mjs'
import { createScheduler, pickNext } from '../server/scheduler.mjs'

const MIN = 60_000
const now = Date.parse('2026-10-01T12:00:00Z')
const v = (over) => ({ status: 'scheduled', scheduledAt: new Date(now - MIN).toISOString(), force: false, ...over })

test('pickNext: chọn bài tới giờ sớm nhất, bỏ qua bài chưa tới giờ', () => {
  const a = v({ id: 'a', scheduledAt: new Date(now - 5 * MIN).toISOString() })
  const b = v({ id: 'b', scheduledAt: new Date(now - 10 * MIN).toISOString() })
  const c = v({ id: 'c', scheduledAt: new Date(now + MIN).toISOString() })
  assert.equal(pickNext([a, b, c], { gapMinutes: 0 }, now).video.id, 'b')
  assert.deepEqual(pickNext([c], {}, now), {})
})

test('pickNext: tôn trọng khoảng cách và giới hạn/ngày, trừ bài "đăng ngay"', () => {
  const recent = { status: 'published', publishedAt: new Date(now - 10 * MIN).toISOString() }
  const due = v({ id: 'due' })
  assert.equal(pickNext([recent, due], { gapMinutes: 60 }, now).blocked, 'gap')
  assert.equal(pickNext([recent, due], { dailyLimit: 1 }, now).blocked, 'daily_limit')
  const forced = v({ id: 'forced', force: true, scheduledAt: new Date(now).toISOString() })
  assert.equal(pickNext([recent, due, forced], { gapMinutes: 60, dailyLimit: 1 }, now).video.id, 'forced')
})

async function startServer(publish) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-server-'))
  const db = createDb(dir, { privacy: 'SELF_ONLY', gapMinutes: 0, dailyLimit: 0, paused: false, hashtagSets: [] })
  const lock = { busy: null }
  const scheduler = createScheduler({ db, publish, lock, intervalMs: 60_000 })
  const app = createApp({ db, scheduler, lock, publisher: { login: async () => {} } })
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s))
  })
  const base = `http://127.0.0.1:${server.address().port}/api`
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      ...(body instanceof FormData ? { body } : body && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    })
    return { status: res.status, body: res.status === 204 ? null : await res.json() }
  }
  return { db, scheduler, call, close: () => server.close() }
}

const uploadForm = (name = 'Video thử.mp4', fields = {}) => {
  const form = new FormData()
  form.append('file', new Blob([Buffer.alloc(1024)], { type: 'video/mp4' }), name)
  for (const [k, val] of Object.entries(fields)) form.append(k, val)
  return form
}

test('API: tải lên → sửa → đăng ngay → đã đăng', async () => {
  const published = []
  const srv = await startServer(async (video) => {
    published.push(video.caption)
    return { status: 'PUBLISH_COMPLETE' }
  })
  try {
    const up = await srv.call('POST', '/videos', uploadForm('Video thử.mp4', { caption: 'hello #fyp', tags: 'a, b' }))
    assert.equal(up.status, 201)
    assert.equal(up.body.title, 'Video thử')
    assert.deepEqual(up.body.tags, ['a', 'b'])
    assert.equal(up.body.status, 'draft')

    const bad = await srv.call('POST', '/videos', uploadForm('x.exe'))
    assert.equal(bad.status, 400)

    const edit = await srv.call('PATCH', `/videos/${up.body.id}`, { caption: 'mới #robot', privacy: 'PUBLIC_TO_EVERYONE' })
    assert.equal(edit.body.caption, 'mới #robot')
    assert.equal((await srv.call('PATCH', `/videos/${up.body.id}`, { privacy: 'NOPE' })).status, 400)

    await srv.call('PATCH', `/videos/${up.body.id}`, { status: 'scheduled', scheduledAt: '2999-01-01T00:00:00Z' })
    const cleared = await srv.call('PATCH', `/videos/${up.body.id}`, { scheduledAt: '' })
    assert.equal(cleared.status, 400)

    await srv.call('POST', `/videos/${up.body.id}/publish`)
    await srv.scheduler.tick()
    const after = await srv.call('GET', `/videos/${up.body.id}`)
    assert.equal(after.body.status, 'published')
    assert.deepEqual(published, ['mới #robot'])

    const stats = await srv.call('GET', '/stats')
    assert.equal(stats.body.counts.published, 1)
    assert.equal(stats.body.publishedToday, 1)
  } finally {
    srv.close()
  }
})

test('API: lên lịch hàng loạt và lỗi khi đăng', async () => {
  const srv = await startServer(async () => {
    throw new Error('Không thấy nút Post')
  })
  try {
    const ids = []
    for (const n of ['a.mp4', 'b.mp4', 'c.mp4']) ids.push((await srv.call('POST', '/videos', uploadForm(n))).body.id)
    const start = new Date(Date.now() - 1000).toISOString()
    const bulk = await srv.call('POST', '/videos/bulk', { ids, action: 'schedule', startAt: start, intervalMinutes: 30 })
    assert.equal(bulk.body.count, 3)
    const list = (await srv.call('GET', '/videos?status=scheduled')).body
    const times = list.map((x) => Date.parse(x.scheduledAt)).sort()
    assert.equal(times[1] - times[0], 30 * MIN)

    await srv.scheduler.tick()
    const failed = (await srv.call('GET', '/videos?status=failed')).body
    assert.equal(failed.length, 1)
    assert.match(failed[0].lastError, /Không thấy nút Post/)

    const logs = (await srv.call('GET', `/logs?videoId=${failed[0].id}`)).body
    assert.ok(logs.some((l) => l.level === 'error'))

    await srv.call('POST', '/videos/bulk', { ids, action: 'delete' })
    assert.equal((await srv.call('GET', '/videos')).body.length, 0)
    assert.equal(fs.readdirSync(srv.db.videosDir).length, 0)
  } finally {
    srv.close()
  }
})

test('API: cài đặt được kiểm tra hợp lệ', async () => {
  const srv = await startServer(async () => ({}))
  try {
    const ok = await srv.call('PUT', '/settings', { gapMinutes: '90', paused: 1, hashtagSets: [{ name: 'Robot', tags: '#robot' }, { name: '' }] })
    assert.equal(ok.body.gapMinutes, 90)
    assert.equal(ok.body.paused, true)
    assert.equal(ok.body.hashtagSets.length, 1)
    assert.equal((await srv.call('PUT', '/settings', { method: 'hack' })).status, 400)
  } finally {
    srv.close()
  }
})
