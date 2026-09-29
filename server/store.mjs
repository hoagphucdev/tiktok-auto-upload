import fs from 'node:fs'
import path from 'node:path'

export const STATUSES = ['draft', 'scheduled', 'publishing', 'failed']
export const PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']

const writeJson = (file, data) => {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

/**
 * Hàng chờ đăng: chỉ gồm video CHƯA có trên TikTok.
 * Mỗi video = 1 file video + 1 file .json cùng tên trong <dir>/pending/.
 * Đăng thành công thì xoá cả 2 file — từ đó thông tin video được lấy từ TikTok.
 */
export function createPendingStore(dir) {
  const pendingDir = path.join(dir, 'pending')
  fs.mkdirSync(pendingDir, { recursive: true })
  const metaPath = (id) => path.join(pendingDir, `${id}.json`)
  const items = new Map()

  for (const f of fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(pendingDir, f), 'utf8'))
      if (fs.existsSync(path.join(pendingDir, v.file))) items.set(v.id, v)
    } catch {
      // file .json hỏng: bỏ qua
    }
  }

  const now = () => new Date().toISOString()

  return {
    videosDir: pendingDir,
    filePath: (video) => path.join(pendingDir, video.file),

    listVideos({ status, q } = {}) {
      const needle = q?.trim().toLowerCase()
      return [...items.values()]
        .filter((v) => !status || v.status === status)
        .filter((v) => !needle || `${v.title} ${v.caption} ${v.tags.join(' ')}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    allVideos: () => [...items.values()],
    getVideo: (id) => items.get(id) || null,

    /** `file` là tên file video đã nằm trong pendingDir; id lấy theo tên file. */
    createVideo(fields) {
      const id = path.parse(fields.file).name
      const video = {
        id,
        title: '',
        caption: '',
        privacy: 'SELF_ONLY',
        tags: [],
        notes: '',
        status: 'draft',
        scheduledAt: null,
        force: false,
        attempts: 0,
        lastError: null,
        createdAt: now(),
        updatedAt: now(),
        ...fields,
      }
      items.set(id, video)
      writeJson(metaPath(id), video)
      return video
    },

    updateVideo(id, patch) {
      const video = items.get(id)
      if (!video) return null
      Object.assign(video, patch, { updatedAt: now() })
      writeJson(metaPath(id), video)
      return video
    },

    /** Xoá khỏi hàng chờ (cả file video). */
    deleteVideo(id) {
      const video = items.get(id)
      if (!video) return null
      items.delete(id)
      fs.rmSync(metaPath(id), { force: true })
      fs.rmSync(path.join(pendingDir, video.file), { force: true })
      return video
    },
  }
}

/** Cài đặt của tool (không phải dữ liệu kênh): <dir>/settings.json */
export function createSettingsStore(dir, defaults) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'settings.json')
  let settings = { ...defaults }
  if (fs.existsSync(file)) settings = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  writeJson(file, settings)
  return {
    get: () => settings,
    update(patch) {
      settings = { ...settings, ...patch }
      writeJson(file, settings)
      return settings
    },
  }
}
