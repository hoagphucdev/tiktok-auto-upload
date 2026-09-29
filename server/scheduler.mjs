import { localDay, logAction, readLog } from '../src/logger.mjs'

// Lỗi tạm thời (rate limit) → lùi lịch thay vì đánh dấu thất bại
const RETRYABLE_CODES = new Set(['rate_limit_exceeded', 'spam_risk_too_many_posts'])
const RETRY_DELAY_MIN = 15

/**
 * Lịch sử đăng lấy từ nhật ký .txt (hôm nay + hôm qua): số bài đã đăng hôm nay và lúc đăng bài gần nhất.
 */
export function publishHistory(now = new Date()) {
  const isPublish = (e) => e.action === 'publish' && e.level === 'success'
  const today = readLog(localDay(now)).filter(isPublish)
  const yesterday = readLog(localDay(new Date(now.getTime() - 86_400_000))).filter(isPublish)
  const last = today[0] || yesterday[0]
  return {
    publishedToday: today.length,
    lastPublishedAt: last ? new Date(last.at.replace(' ', 'T')).toISOString() : null,
  }
}

/**
 * Chọn video tiếp theo cần đăng. Hàm thuần để dễ test.
 * - Video "Đăng ngay" (force) bỏ qua khoảng cách & giới hạn/ngày.
 * - Còn lại: tới giờ hẹn, cách bài trước >= gapMinutes, chưa vượt dailyLimit.
 */
export function pickNext(videos, settings, history, now = Date.now()) {
  const due = videos
    .filter((v) => v.status === 'scheduled' && Date.parse(v.scheduledAt) <= now)
    .sort((a, b) => Number(b.force) - Number(a.force) || a.scheduledAt.localeCompare(b.scheduledAt))
  if (!due.length) return {}
  const next = due[0]
  if (next.force) return { video: next }

  if (settings.dailyLimit > 0 && history.publishedToday >= settings.dailyLimit) return { blocked: 'daily_limit' }

  const last = history.lastPublishedAt ? Date.parse(history.lastPublishedAt) : 0
  const gapMs = (settings.gapMinutes || 0) * 60_000
  if (last && now - last < gapMs) return { blocked: 'gap', until: new Date(last + gapMs).toISOString() }

  return { video: next }
}

/**
 * Chạy nền trong server: cứ `intervalMs` kiểm tra 1 lần, mỗi lần đăng tối đa 1 video.
 * `lock` dùng chung với đăng nhập / lấy dữ liệu kênh để không mở 2 trình duyệt cùng profile.
 */
export function createScheduler({ store, getSettings, publish, lock, onPublished, intervalMs = 20_000, history = publishHistory }) {
  const state = { lastBlocked: null }
  let timer
  const log = (level, action, message, target) => logAction({ level, actor: 'scheduler', action, message, target })
  const name = (v) => `"${v.title || v.originalName}"`

  async function tick() {
    const settings = getSettings()
    if (lock.busy) return
    const { video, blocked, until } = pickNext(store.allVideos(), settings, history())
    if (blocked) {
      const key = blocked === 'gap' ? `gap:${until}` : `limit:${localDay()}`
      if (state.lastBlocked !== key) {
        state.lastBlocked = key
        log(
          'info',
          'wait',
          blocked === 'gap'
            ? `Chờ đủ khoảng cách giữa 2 bài, bài tiếp theo sau ${new Date(until).toLocaleString('vi-VN')}`
            : `Đã đạt giới hạn ${settings.dailyLimit} bài hôm nay, các bài còn lại chờ sang ngày mai`,
        )
      }
      return
    }
    if (!video || (settings.paused && !video.force)) return

    lock.busy = { kind: 'publish', videoId: video.id, title: video.title }
    store.updateVideo(video.id, { status: 'publishing', attempts: video.attempts + 1, lastError: null })
    log('info', 'publish', `Bắt đầu đăng ${name(video)}`, `pending=${video.id}`)
    try {
      const result = await publish(store.getVideo(video.id), settings)
      if (result?.status === 'FAILED' || result?.status === 'TIMEOUT') {
        throw new Error(`TikTok trả về ${result.status}${result.fail_reason ? `: ${result.fail_reason}` : ''}`)
      }
      // Đã lên TikTok: bỏ khỏi hàng chờ, từ giờ thông tin lấy từ TikTok
      store.deleteVideo(video.id)
      log(
        'success',
        'publish',
        result?.mode === 'inbox'
          ? `Đã gửi ${name(video)} vào hộp nháp TikTok — mở app TikTok, dán caption và bấm Đăng`
          : `Đã đăng ${name(video)} lên TikTok (quyền xem: ${video.privacy})`,
        video.caption.slice(0, 80),
      )
      onPublished?.()
    } catch (err) {
      if (RETRYABLE_CODES.has(err.code)) {
        const retryAt = new Date(Date.now() + RETRY_DELAY_MIN * 60_000).toISOString()
        store.updateVideo(video.id, { status: 'scheduled', scheduledAt: retryAt, lastError: err.message })
        log('warn', 'publish', `TikTok giới hạn tần suất, thử lại ${name(video)} lúc ${new Date(retryAt).toLocaleString('vi-VN')}`, `pending=${video.id}`)
      } else {
        store.updateVideo(video.id, { status: 'failed', force: false, lastError: err.message })
        log('error', 'publish', `Đăng ${name(video)} thất bại: ${err.message}`, `pending=${video.id}`)
      }
    } finally {
      lock.busy = null
    }
  }

  let running = false
  const safeTick = async () => {
    if (running) return
    running = true
    try {
      await tick()
    } catch (err) {
      log('error', 'scheduler', `Lỗi bộ lập lịch: ${err.message}`)
    } finally {
      running = false
    }
  }

  return {
    tick: safeTick,
    start() {
      // Video đang "publishing" lúc server tắt → không biết kết quả, đánh dấu lỗi để người dùng kiểm tra trên TikTok
      for (const v of store.allVideos().filter((v) => v.status === 'publishing')) {
        store.updateVideo(v.id, {
          status: 'failed',
          force: false,
          lastError: 'Server tắt khi đang đăng — kiểm tra trên TikTok trước khi đăng lại',
        })
      }
      timer = setInterval(safeTick, intervalMs)
      safeTick()
    },
    stop: () => clearInterval(timer),
  }
}
