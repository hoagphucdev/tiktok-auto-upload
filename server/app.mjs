import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import { LEVELS, listLogDays, localDay, logAction, logFile, readLog } from '../src/logger.mjs'
import { PRIVACY_LEVELS, STATUSES } from './store.mjs'

const VIDEO_EXTS = ['.mp4', '.mov', '.webm']
const MAX_CAPTION = 2200
const EDITABLE = ['title', 'caption', 'privacy', 'tags', 'notes', 'scheduledAt', 'status']
const SETTINGS_KEYS = [
  'username',
  'maxVideos',
  'method',
  'privacy',
  'browser',
  'chromiumPath',
  'cdpUrl',
  'headless',
  'gapMinutes',
  'dailyLimit',
  'paused',
  'hashtagSets',
]
const PRIVACY_TEXT = {
  PUBLIC_TO_EVERYONE: 'Mọi người',
  FOLLOWER_OF_CREATOR: 'Người theo dõi',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè',
  SELF_ONLY: 'Chỉ mình tôi',
}

const httpError = (status, message) => Object.assign(new Error(message), { status })

function basicAuth(password) {
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ')
    const given = scheme === 'Basic' ? Buffer.from(encoded || '', 'base64').toString().split(':').slice(1).join(':') : ''
    const ok = given.length === password.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(password))
    if (ok) return next()
    res.set('WWW-Authenticate', 'Basic realm="TikTok Manager"').status(401).send('Cần đăng nhập')
  }
}

function validateVideoPatch(body, current) {
  const patch = {}
  for (const key of EDITABLE) if (key in body) patch[key] = body[key]

  if ('title' in patch) patch.title = String(patch.title ?? '').slice(0, 200)
  if ('notes' in patch) patch.notes = String(patch.notes ?? '')
  if ('caption' in patch) {
    patch.caption = String(patch.caption ?? '')
    if (patch.caption.length > MAX_CAPTION) throw httpError(400, `Caption tối đa ${MAX_CAPTION} ký tự`)
  }
  if ('privacy' in patch && !PRIVACY_LEVELS.includes(patch.privacy)) throw httpError(400, 'Chế độ riêng tư không hợp lệ')
  if ('tags' in patch) {
    const tags = Array.isArray(patch.tags) ? patch.tags : String(patch.tags ?? '').split(',')
    patch.tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))]
  }
  if ('scheduledAt' in patch) {
    if (patch.scheduledAt) {
      const t = Date.parse(patch.scheduledAt)
      if (Number.isNaN(t)) throw httpError(400, 'Thời gian hẹn không hợp lệ')
      patch.scheduledAt = new Date(t).toISOString()
    } else {
      patch.scheduledAt = null
    }
  }
  if ('status' in patch) {
    if (!['draft', 'scheduled'].includes(patch.status)) throw httpError(400, 'Chỉ được chuyển sang Nháp hoặc Lên lịch')
    if (patch.status === 'scheduled') patch.scheduledAt ||= current?.scheduledAt || new Date().toISOString()
    if (patch.status === 'draft') patch.force = false
  }
  const status = patch.status ?? current?.status
  const scheduledAt = 'scheduledAt' in patch ? patch.scheduledAt : current?.scheduledAt
  if (status === 'scheduled' && !scheduledAt) throw httpError(400, 'Video đã lên lịch phải có giờ hẹn (hoặc chuyển về nháp)')
  return patch
}

// Mô tả ngắn các trường đã đổi để ghi nhật ký
function describeChanges(before, patch) {
  const labels = { title: 'tiêu đề', caption: 'caption', privacy: 'quyền xem', tags: 'tag', notes: 'ghi chú', scheduledAt: 'giờ hẹn', status: 'trạng thái' }
  return Object.keys(patch)
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]))
    .map((k) => {
      if (k === 'privacy') return `quyền xem → ${PRIVACY_TEXT[patch[k]]}`
      if (k === 'scheduledAt') return `giờ hẹn → ${patch[k] ? new Date(patch[k]).toLocaleString('vi-VN') : 'trống'}`
      if (k === 'status') return `trạng thái → ${patch[k]}`
      return labels[k] || k
    })
}

export function createApp({ store, settings, channel, scheduler, publisher, lock, password, staticDir }) {
  const app = express()
  app.disable('x-powered-by')
  if (password) app.use(basicAuth(password))
  app.use(express.json({ limit: '1mb' }))

  // Mọi thao tác của người dùng trên web đều ghi vào nhật ký .txt theo ngày
  const audit = (req, action, message, target, level = 'info') =>
    logAction({ level, actor: `web:${(req.ip || '').replace(/^::ffff:/, '')}`, action, message, target })
  const name = (v) => `"${v.title || v.originalName}"`

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.videosDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 4 * 1024 ** 3 },
    fileFilter: (req, file, cb) =>
      VIDEO_EXTS.includes(path.extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(httpError(400, `Chỉ hỗ trợ ${VIDEO_EXTS.join(', ')}`)),
  })

  const api = express.Router()

  // ---------- Kênh TikTok (luôn lấy từ TikTok) ----------
  api.get('/channel', async (req, res) => {
    const refresh = req.query.refresh === '1'
    if (refresh) audit(req, 'refresh', `Yêu cầu làm mới dữ liệu kênh @${settings.get().username} từ TikTok`)
    res.json(await channel.get({ refresh }))
  })

  api.get('/channel/videos/:id', async (req, res) => {
    const data = await channel.get()
    const video = data.videos.find((v) => v.id === req.params.id)
    if (!video) throw httpError(404, 'Không thấy video này trong dữ liệu vừa lấy từ TikTok')
    res.json({ ...video, author: data.user, fetchedAt: data.fetchedAt })
  })

  // ---------- Hàng chờ đăng (video chưa có trên TikTok) ----------
  const getEditable = (id) => {
    const video = store.getVideo(id)
    if (!video) throw httpError(404, 'Không tìm thấy video trong hàng chờ')
    if (video.status === 'publishing') throw httpError(409, 'Video đang được đăng, chờ xong rồi thử lại')
    return video
  }

  api.get('/pending', (req, res) => {
    const { status, q } = req.query
    if (status && !STATUSES.includes(status)) throw httpError(400, 'Trạng thái không hợp lệ')
    res.json(store.listVideos({ status, q }))
  })

  api.post('/pending', upload.single('file'), (req, res) => {
    if (!req.file) throw httpError(400, 'Thiếu file video')
    const body = { ...req.body }
    if (typeof body.tags === 'string') body.tags = body.tags.split(',')
    let patch
    try {
      patch = validateVideoPatch(body)
    } catch (err) {
      fs.rm(req.file.path, { force: true }, () => {})
      throw err
    }
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    const video = store.createVideo({
      title: path.parse(originalName).name,
      privacy: settings.get().privacy,
      ...patch,
      file: req.file.filename,
      originalName,
      size: req.file.size,
    })
    audit(req, 'upload', `Tải lên ${name(video)} (${(video.size / 1024 ** 2).toFixed(1)} MB) vào hàng chờ`, `pending=${video.id}`)
    res.status(201).json(video)
  })

  api.get('/pending/:id', (req, res) => {
    const video = store.getVideo(req.params.id)
    if (!video) throw httpError(404, 'Không tìm thấy video trong hàng chờ')
    res.json(video)
  })

  api.get('/pending/:id/file', (req, res) => {
    const video = store.getVideo(req.params.id)
    if (!video) throw httpError(404, 'Không tìm thấy video trong hàng chờ')
    res.sendFile(store.filePath(video))
  })

  api.patch('/pending/:id', (req, res) => {
    const video = getEditable(req.params.id)
    const before = { ...video }
    const patch = validateVideoPatch(req.body, video)
    const changes = describeChanges(before, patch)
    const updated = store.updateVideo(video.id, patch)
    if (changes.length) audit(req, 'edit', `Sửa ${name(updated)}: ${changes.join(', ')}`, `pending=${video.id}`)
    res.json(updated)
  })

  api.delete('/pending/:id', (req, res) => {
    const video = getEditable(req.params.id)
    store.deleteVideo(video.id)
    audit(req, 'delete', `Xoá ${name(video)} khỏi hàng chờ`, `pending=${video.id}`)
    res.status(204).end()
  })

  // Đăng ngay / thử lại: đưa lên đầu hàng đợi, bỏ qua khoảng cách & giới hạn ngày
  api.post('/pending/:id/publish', (req, res) => {
    const video = getEditable(req.params.id)
    const updated = store.updateVideo(video.id, { status: 'scheduled', scheduledAt: new Date().toISOString(), force: true })
    audit(req, 'publish', `Yêu cầu đăng ngay ${name(video)}`, `pending=${video.id}`)
    scheduler.tick()
    res.json(updated)
  })

  api.post('/pending/bulk', (req, res) => {
    const { ids = [], action, startAt, intervalMinutes = 60 } = req.body
    const videos = ids.map((id) => store.getVideo(id)).filter((v) => v && v.status !== 'publishing')
    if (action === 'delete') {
      videos.forEach((v) => store.deleteVideo(v.id))
      audit(req, 'delete', `Xoá hàng loạt ${videos.length} video khỏi hàng chờ: ${videos.map(name).join(', ')}`)
    } else if (action === 'draft') {
      videos.forEach((v) => store.updateVideo(v.id, { status: 'draft', force: false }))
      audit(req, 'edit', `Chuyển ${videos.length} video về nháp: ${videos.map(name).join(', ')}`)
    } else if (action === 'schedule') {
      const start = Date.parse(startAt)
      if (Number.isNaN(start)) throw httpError(400, 'Thời gian bắt đầu không hợp lệ')
      videos.forEach((v, i) =>
        store.updateVideo(v.id, {
          status: 'scheduled',
          force: false,
          scheduledAt: new Date(start + i * Number(intervalMinutes) * 60_000).toISOString(),
        }),
      )
      audit(
        req,
        'schedule',
        `Lên lịch hàng loạt ${videos.length} video từ ${new Date(start).toLocaleString('vi-VN')}, cách nhau ${intervalMinutes} phút`,
      )
    } else {
      throw httpError(400, 'Hành động không hợp lệ')
    }
    res.json({ count: videos.length })
  })

  // ---------- Tổng hợp ----------
  api.get('/stats', (req, res) => {
    const videos = store.allVideos()
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    for (const v of videos) counts[v.status]++
    const s = settings.get()
    const todayLog = readLog(localDay())
    res.json({
      counts,
      publishedToday: todayLog.filter((e) => e.action === 'publish' && e.level === 'success').length,
      dailyLimit: s.dailyLimit,
      paused: s.paused,
      username: s.username,
      method: s.method,
      lastLoginAt: s.lastLoginAt,
      upcoming: videos
        .filter((v) => v.status === 'scheduled')
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 5),
      busy: lock.busy,
      channelError: channel.lastError(),
    })
  })

  // ---------- Nhật ký .txt theo ngày ----------
  api.get('/logs', (req, res) => res.json({ today: localDay(), days: listLogDays() }))

  api.get('/logs/:day', (req, res) => {
    const { level, actor } = req.query
    if (level && !LEVELS.includes(level)) throw httpError(400, 'Mức log không hợp lệ')
    const entries = readLog(req.params.day)
      .filter((e) => !level || e.level === level)
      .filter((e) => !actor || e.actor.startsWith(actor))
    res.json(entries.slice(0, Math.min(Number(req.query.limit) || 1000, 5000)))
  })

  api.get('/logs/:day/download', (req, res) => {
    const file = logFile(req.params.day)
    if (!fs.existsSync(file)) throw httpError(404, 'Không có nhật ký ngày này')
    res.download(file, `tiktok-manager-${req.params.day}.txt`)
  })

  // ---------- Cài đặt & đăng nhập ----------
  api.get('/settings', (req, res) => res.json(settings.get()))

  api.put('/settings', (req, res) => {
    const patch = {}
    for (const key of SETTINGS_KEYS) if (key in req.body) patch[key] = req.body[key]
    if ('username' in patch) patch.username = String(patch.username ?? '').replace(/^@/, '').trim()
    if ('username' in patch && patch.username && !/^[\w.]{2,24}$/.test(patch.username)) throw httpError(400, 'Tên kênh không hợp lệ')
    if ('method' in patch && !['browser', 'api'].includes(patch.method)) throw httpError(400, 'Cách đăng không hợp lệ')
    if ('browser' in patch && !['chromium', 'brave'].includes(patch.browser)) throw httpError(400, 'Trình duyệt không hợp lệ')
    if ('privacy' in patch && !PRIVACY_LEVELS.includes(patch.privacy)) throw httpError(400, 'Chế độ riêng tư không hợp lệ')
    for (const key of ['gapMinutes', 'dailyLimit', 'maxVideos']) {
      if (key in patch) {
        patch[key] = Number(patch[key])
        if (!Number.isFinite(patch[key]) || patch[key] < 0) throw httpError(400, `${key} phải là số >= 0`)
      }
    }
    if ('maxVideos' in patch) patch.maxVideos = Math.min(Math.max(patch.maxVideos, 1), 500)
    for (const key of ['headless', 'paused']) if (key in patch) patch[key] = Boolean(patch[key])
    if ('hashtagSets' in patch) {
      if (!Array.isArray(patch.hashtagSets)) throw httpError(400, 'hashtagSets phải là mảng')
      patch.hashtagSets = patch.hashtagSets
        .map((s) => ({ name: String(s.name ?? '').trim(), tags: String(s.tags ?? '').trim() }))
        .filter((s) => s.name && s.tags)
    }

    const before = settings.get()
    const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]))
    const saved = settings.update(patch)
    if ('paused' in patch && patch.paused !== before.paused) {
      audit(req, 'settings', patch.paused ? 'Tạm dừng tự động đăng' : 'Bật lại tự động đăng')
    }
    const others = changed.filter((k) => k !== 'paused')
    if (others.length) audit(req, 'settings', `Đổi cài đặt: ${others.join(', ')}`)
    if (changed.includes('username') || changed.includes('method')) channel.invalidate()
    res.json(saved)
  })

  api.post('/auth/login', (req, res) => {
    if (lock.busy) throw httpError(409, 'Trình duyệt đang bận, thử lại sau')
    lock.busy = { kind: 'login' }
    let started
    try {
      started = publisher.login(settings.get())
    } catch (err) {
      lock.busy = null
      throw err
    }
    audit(req, 'login', 'Mở trình duyệt để đăng nhập TikTok')
    Promise.resolve(started)
      .then(() => {
        settings.update({ lastLoginAt: new Date().toISOString() })
        logAction({ level: 'success', actor: 'system', action: 'login', message: 'Đăng nhập TikTok thành công' })
        channel.invalidate()
      })
      .catch((err) => logAction({ level: 'error', actor: 'system', action: 'login', message: `Đăng nhập thất bại: ${err.message}` }))
      .finally(() => {
        lock.busy = null
      })
    res.status(202).json({ started: true })
  })

  app.use('/api', api)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Không có API này' }))

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir))
    app.get('/{*path}', (req, res) => res.sendFile(path.join(staticDir, 'index.html')))
  }

  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500)
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message })
  })

  return app
}
