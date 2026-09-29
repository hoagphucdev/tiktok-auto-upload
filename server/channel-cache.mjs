import { logAction } from '../src/logger.mjs'

/**
 * Dữ liệu kênh luôn lấy từ TikTok. Chỉ giữ tạm trong RAM `ttlMs` để khỏi mở trình duyệt mỗi lần
 * chuyển trang; tắt server là mất, không ghi xuống đĩa.
 */
export function createChannelCache({ fetchChannel, lock, getSettings, ttlMs = 5 * 60_000 }) {
  let cache = null // { data, username, at }
  let inflight = null
  let lastError = null

  async function load() {
    const settings = getSettings()
    lock.busy = { kind: 'fetch' }
    try {
      const data = await fetchChannel({ username: settings.username, maxVideos: settings.maxVideos })
      cache = { data, username: settings.username, at: Date.now() }
      lastError = null
      logAction({
        level: 'success',
        actor: 'system',
        action: 'fetch',
        message: `Lấy dữ liệu kênh @${data.user.username} từ TikTok: ${data.user.stats.followers} người theo dõi, ${data.videos.length}/${data.user.stats.videos} video`,
      })
      return data
    } catch (err) {
      lastError = { message: err.message, at: new Date().toISOString() }
      logAction({ level: 'error', actor: 'system', action: 'fetch', message: `Lấy dữ liệu kênh @${settings.username} thất bại: ${err.message}` })
      throw err
    } finally {
      lock.busy = null
    }
  }

  return {
    /**
     * Trả dữ liệu kênh. `refresh` = bỏ qua cache. Nếu trình duyệt đang bận đăng bài thì trả
     * cache cũ (đánh dấu stale) thay vì chờ.
     */
    async get({ refresh = false } = {}) {
      const username = getSettings().username
      const fresh = cache && cache.username === username && Date.now() - cache.at < ttlMs
      if (fresh && !refresh) return { ...cache.data, cached: true }
      if (inflight) return inflight
      if (lock.busy) {
        if (cache && cache.username === username) return { ...cache.data, cached: true, stale: true }
        throw Object.assign(new Error('Trình duyệt đang bận (đang đăng bài hoặc đăng nhập), thử lại sau ít phút'), { status: 409 })
      }
      inflight = load().finally(() => {
        inflight = null
      })
      return inflight
    },
    peek: () => (cache ? { ...cache.data, cached: true } : null),
    lastError: () => lastError,
    invalidate() {
      if (cache) cache.at = 0
    },
  }
}
