import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import { PRIVACY_LEVELS, STATUSES } from './db.mjs'

const VIDEO_EXTS = ['.mp4', '.mov', '.webm']
const MAX_CAPTION = 2200
const EDITABLE = ['title', 'caption', 'privacy', 'tags', 'notes', 'scheduledAt', 'status']
const SETTINGS_KEYS = ['method', 'privacy', 'browser', 'chromiumPath', 'cdpUrl', 'headless', 'gapMinutes', 'dailyLimit', 'paused', 'hashtagSets']

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
  if ('scheduledAt' in patch && patch.scheduledAt) {
    const t = Date.parse(patch.scheduledAt)
    if (Number.isNaN(t)) throw httpError(400, 'Thời gian hẹn không hợp lệ')
    patch.scheduledAt = new Date(t).toISOString()
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

export function createApp({ db, scheduler, publisher, lock, password, staticDir }) {
  const app = express()
  app.disable('x-powered-by')
  if (password) app.use(basicAuth(password))
  app.use(express.json({ limit: '1mb' }))

  const upload = multer({
    storage: multer.diskStorage({
      destination: db.videosDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 4 * 1024 ** 3 },
    fileFilter: (req, file, cb) =>
      VIDEO_EXTS.includes(path.extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(httpError(400, `Chỉ hỗ trợ ${VIDEO_EXTS.join(', ')}`)),
  })

  const api = express.Router()

  const getEditable = (id) => {
    const video = db.getVideo(id)
    if (!video) throw httpError(404, 'Không tìm thấy video')
    if (video.status === 'publishing') throw httpError(409, 'Video đang được đăng, chờ xong rồi thử lại')
    return video
  }

  const removeVideo = (video) => {
    db.deleteVideo(video.id)
    fs.rm(db.filePath(video), { force: true }, () => {})
    db.log('info', `Đã xoá "${video.title || video.originalName}"`)
  }

  api.get('/videos', (req, res) => {
    const { status, q } = req.query
    if (status && !STATUSES.includes(status)) throw httpError(400, 'Trạng thái không hợp lệ')
    res.json(db.listVideos({ status, q }))
  })

  api.post('/videos', upload.single('file'), (req, res) => {
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
    const video = db.createVideo({
      title: path.parse(originalName).name,
      ...patch,
      file: req.file.filename,
      originalName,
      size: req.file.size,
    })
    db.log('info', `Đã tải lên "${video.title}"`, video.id)
    res.status(201).json(video)
  })

  api.get('/videos/:id', (req, res) => {
    const video = db.getVideo(req.params.id)
    if (!video) throw httpError(404, 'Không tìm thấy video')
    res.json(video)
  })

  api.get('/videos/:id/file', (req, res) => {
    const video = db.getVideo(req.params.id)
    if (!video) throw httpError(404, 'Không tìm thấy video')
    res.sendFile(db.filePath(video))
  })

  api.patch('/videos/:id', (req, res) => {
    const video = getEditable(req.params.id)
    const updated = db.updateVideo(video.id, validateVideoPatch(req.body, video))
    if (req.body.status === 'scheduled' && video.status !== 'scheduled') {
      db.log('info', `Đã lên lịch lúc ${new Date(updated.scheduledAt).toLocaleString('vi-VN')}`, video.id)
    }
    res.json(updated)
  })

  api.delete('/videos/:id', (req, res) => {
    removeVideo(getEditable(req.params.id))
    res.status(204).end()
  })

  // Đăng ngay / thử lại: đưa lên đầu hàng đợi, bỏ qua khoảng cách & giới hạn ngày
  api.post('/videos/:id/publish', (req, res) => {
    const video = getEditable(req.params.id)
    const updated = db.updateVideo(video.id, { status: 'scheduled', scheduledAt: new Date().toISOString(), force: true })
    db.log('info', 'Yêu cầu đăng ngay', video.id)
    scheduler.tick()
    res.json(updated)
  })

  api.post('/videos/bulk', (req, res) => {
    const { ids = [], action, startAt, intervalMinutes = 60 } = req.body
    const videos = ids.map((id) => db.getVideo(id)).filter((v) => v && v.status !== 'publishing')
    if (action === 'delete') {
      videos.forEach(removeVideo)
    } else if (action === 'draft') {
      videos.forEach((v) => db.updateVideo(v.id, { status: 'draft', force: false }))
    } else if (action === 'schedule') {
      const start = Date.parse(startAt)
      if (Number.isNaN(start)) throw httpError(400, 'Thời gian bắt đầu không hợp lệ')
      videos.forEach((v, i) =>
        db.updateVideo(v.id, {
          status: 'scheduled',
          force: false,
          scheduledAt: new Date(start + i * Number(intervalMinutes) * 60_000).toISOString(),
        }),
      )
      db.log('info', `Đã lên lịch hàng loạt ${videos.length} video, cách nhau ${intervalMinutes} phút`)
    } else {
      throw httpError(400, 'Hành động không hợp lệ')
    }
    res.json({ count: videos.length })
  })

  api.get('/stats', (req, res) => {
    const videos = db.allVideos()
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    for (const v of videos) counts[v.status]++
    const today = new Date().toDateString()
    const settings = db.getSettings()
    res.json({
      counts,
      total: videos.length,
      publishedToday: videos.filter((v) => v.publishedAt && new Date(v.publishedAt).toDateString() === today).length,
      dailyLimit: settings.dailyLimit,
      paused: settings.paused,
      upcoming: videos
        .filter((v) => v.status === 'scheduled')
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 5),
      busy: lock.busy,
      lastLoginAt: settings.lastLoginAt,
      method: settings.method,
    })
  })

  api.get('/logs', (req, res) => {
    res.json(db.listLogs({ videoId: req.query.videoId, limit: Math.min(Number(req.query.limit) || 200, 1000) }))
  })

  api.get('/settings', (req, res) => res.json(db.getSettings()))

  api.put('/settings', (req, res) => {
    const patch = {}
    for (const key of SETTINGS_KEYS) if (key in req.body) patch[key] = req.body[key]
    if ('method' in patch && !['browser', 'api'].includes(patch.method)) throw httpError(400, 'Cách đăng không hợp lệ')
    if ('browser' in patch && !['chromium', 'brave'].includes(patch.browser)) throw httpError(400, 'Trình duyệt không hợp lệ')
    if ('privacy' in patch && !PRIVACY_LEVELS.includes(patch.privacy)) throw httpError(400, 'Chế độ riêng tư không hợp lệ')
    for (const key of ['gapMinutes', 'dailyLimit']) {
      if (key in patch) {
        patch[key] = Number(patch[key])
        if (!Number.isFinite(patch[key]) || patch[key] < 0) throw httpError(400, `${key} phải là số >= 0`)
      }
    }
    for (const key of ['headless', 'paused']) if (key in patch) patch[key] = Boolean(patch[key])
    if ('hashtagSets' in patch) {
      if (!Array.isArray(patch.hashtagSets)) throw httpError(400, 'hashtagSets phải là mảng')
      patch.hashtagSets = patch.hashtagSets
        .map((s) => ({ name: String(s.name ?? '').trim(), tags: String(s.tags ?? '').trim() }))
        .filter((s) => s.name && s.tags)
    }
    if ('paused' in patch && patch.paused !== db.getSettings().paused) {
      db.log('info', patch.paused ? 'Đã tạm dừng tự động đăng' : 'Đã bật lại tự động đăng')
    }
    res.json(db.updateSettings(patch))
  })

  api.post('/auth/login', (req, res) => {
    if (lock.busy) throw httpError(409, 'Trình duyệt đang bận, thử lại sau')
    const settings = db.getSettings()
    lock.busy = { kind: 'login' }
    let started
    try {
      started = publisher.login(settings)
    } catch (err) {
      lock.busy = null
      throw err
    }
    db.log('info', 'Đã mở trình duyệt để đăng nhập TikTok')
    Promise.resolve(started)
      .then(() => {
        db.updateSettings({ lastLoginAt: new Date().toISOString() })
        db.log('success', 'Đăng nhập TikTok thành công')
      })
      .catch((err) => db.log('error', `Đăng nhập thất bại: ${err.message}`))
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
