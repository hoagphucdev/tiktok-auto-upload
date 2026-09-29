import { logAction } from '../src/logger.mjs'

/**
 * Dữ liệu kênh luôn lấy từ TikTok (Display API). Chỉ giữ tạm trong RAM `ttlMs` để chuyển trang
 * không phải gọi API lại; tắt server là mất, không ghi xuống đĩa.
 */
export function createChannelCache({ fetchChannel, getSettings, ttlMs = 5 * 60_000 }) {
  let cache = null // { data, at }
  let inflight = null
  let lastError = null

  async function load() {
    try {
      const data = await fetchChannel({ maxVideos: getSettings().maxVideos })
      cache = { data, at: Date.now() }
      lastError = null
      const s = data.user.stats
      logAction({
        level: 'success',
        actor: 'system',
        action: 'fetch',
        message:
          `Lấy dữ liệu kênh ${data.user.username ? `@${data.user.username}` : data.user.nickname} từ TikTok API: ` +
          `${s.followers ?? '?'} người theo dõi, ${data.videos.length}/${s.videos ?? '?'} video`,
      })
      return data
    } catch (err) {
      lastError = { message: err.message, at: new Date().toISOString() }
      logAction({ level: 'error', actor: 'system', action: 'fetch', message: `Lấy dữ liệu kênh thất bại: ${err.message}` })
      throw err
    }
  }

  return {
    /** Trả dữ liệu kênh; `refresh` = bỏ qua cache. Các request trùng lúc dùng chung 1 lần gọi API. */
    async get({ refresh = false } = {}) {
      if (cache && !refresh && Date.now() - cache.at < ttlMs) return { ...cache.data, cached: true }
      inflight ||= load().finally(() => {
        inflight = null
      })
      return inflight
    },
    lastError: () => lastError,
    invalidate() {
      cache = null
    },
  }
}
