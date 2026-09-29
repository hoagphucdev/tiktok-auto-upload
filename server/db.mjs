import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed']
export const PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']
const MAX_LOGS = 1000

/**
 * Kho dữ liệu dạng file JSON (data/db.json) — đủ cho 1 người quản lý 1 kênh.
 * Mọi thay đổi được ghi ngay xuống đĩa bằng cách ghi file tạm rồi rename.
 */
export function createDb(dir, defaults = {}) {
  const videosDir = path.join(dir, 'videos')
  fs.mkdirSync(videosDir, { recursive: true })
  const file = path.join(dir, 'db.json')

  let data = { videos: [], logs: [], settings: {} }
  if (fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  data.settings = { ...defaults, ...data.settings }

  const save = () => {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, file)
  }
  save()

  const now = () => new Date().toISOString()
  const find = (id) => data.videos.find((v) => v.id === id)

  return {
    dir,
    videosDir,
    filePath: (video) => path.join(videosDir, video.file),

    listVideos({ status, q } = {}) {
      const needle = q?.trim().toLowerCase()
      return data.videos
        .filter((v) => !status || v.status === status)
        .filter((v) => !needle || `${v.title} ${v.caption} ${v.tags.join(' ')}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    allVideos: () => data.videos,
    getVideo: (id) => find(id) || null,

    createVideo(fields) {
      const video = {
        id: crypto.randomUUID(),
        title: '',
        caption: '',
        privacy: data.settings.privacy || 'SELF_ONLY',
        tags: [],
        notes: '',
        status: 'draft',
        scheduledAt: null,
        publishedAt: null,
        force: false,
        attempts: 0,
        lastError: null,
        createdAt: now(),
        updatedAt: now(),
        ...fields,
      }
      data.videos.push(video)
      save()
      return video
    },

    updateVideo(id, patch) {
      const video = find(id)
      if (!video) return null
      Object.assign(video, patch, { updatedAt: now() })
      save()
      return video
    },

    deleteVideo(id) {
      const video = find(id)
      if (!video) return null
      data.videos = data.videos.filter((v) => v.id !== id)
      save()
      return video
    },

    log(level, message, videoId = null) {
      const entry = { id: crypto.randomUUID(), at: now(), level, message, videoId }
      data.logs.push(entry)
      if (data.logs.length > MAX_LOGS) data.logs = data.logs.slice(-MAX_LOGS)
      save()
      return entry
    },

    listLogs({ videoId, limit = 200 } = {}) {
      return data.logs
        .filter((l) => !videoId || l.videoId === videoId)
        .slice(-limit)
        .reverse()
    },

    getSettings: () => data.settings,
    updateSettings(patch) {
      data.settings = { ...data.settings, ...patch }
      save()
      return data.settings
    },
  }
}
