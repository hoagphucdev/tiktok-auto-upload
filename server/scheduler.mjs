const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

// Lỗi tạm thời (rate limit, mạng) → lùi lịch thay vì đánh dấu thất bại
const RETRYABLE_CODES = new Set(['rate_limit_exceeded', 'spam_risk_too_many_posts'])
const RETRY_DELAY_MIN = 15

/**
 * Chọn video tiếp theo cần đăng. Hàm thuần để dễ test.
 * - Video "Đăng ngay" (force) bỏ qua giới hạn khoảng cách & số bài/ngày.
 * - Còn lại: phải tới giờ hẹn, cách bài trước >= gapMinutes, và chưa vượt dailyLimit.
 */
export function pickNext(videos, settings, now = Date.now()) {
  const due = videos
    .filter((v) => v.status === 'scheduled' && Date.parse(v.scheduledAt) <= now)
    .sort((a, b) => Number(b.force) - Number(a.force) || a.scheduledAt.localeCompare(b.scheduledAt))
  if (!due.length) return {}
  const next = due[0]
  if (next.force) return { video: next }

  const published = videos.filter((v) => v.publishedAt)
  const publishedToday = published.filter((v) => sameLocalDay(v.publishedAt, now)).length
  if (settings.dailyLimit > 0 && publishedToday >= settings.dailyLimit) {
    return { blocked: 'daily_limit' }
  }

  const last = Math.max(0, ...published.map((v) => Date.parse(v.publishedAt)))
  const gapMs = (settings.gapMinutes || 0) * 60_000
  if (last && now - last < gapMs) return { blocked: 'gap', until: new Date(last + gapMs).toISOString() }

  return { video: next }
}

/**
 * Chạy nền trong server: cứ `intervalMs` kiểm tra 1 lần, mỗi lần đăng tối đa 1 video.
 * `lock` dùng chung với chức năng đăng nhập để không mở 2 trình duyệt cùng profile.
 */
export function createScheduler({ db, publish, lock, intervalMs = 20_000 }) {
  const state = { lastBlocked: null }
  let timer

  async function tick() {
    const settings = db.getSettings()
    if (lock.busy) return
    const { video, blocked, until } = pickNext(db.allVideos(), settings)
    if (blocked) {
      const key = blocked === 'gap' ? `gap:${until}` : `limit:${new Date().toDateString()}`
      if (state.lastBlocked !== key) {
        state.lastBlocked = key
        db.log('info', blocked === 'gap'
          ? `Chờ đủ khoảng cách giữa 2 bài, bài tiếp theo sau ${new Date(until).toLocaleString('vi-VN')}`
          : `Đã đạt giới hạn ${settings.dailyLimit} bài hôm nay, các bài còn lại chờ sang ngày mai`)
      }
      return
    }
    if (!video) return
    if (settings.paused && !video.force) return

    lock.busy = { kind: 'publish', videoId: video.id }
    db.updateVideo(video.id, { status: 'publishing', attempts: video.attempts + 1, lastError: null })
    db.log('info', `Bắt đầu đăng "${video.title || video.originalName}"`, video.id)
    try {
      const result = await publish(db.getVideo(video.id), settings)
      if (result?.status === 'FAILED' || result?.status === 'TIMEOUT') {
        throw new Error(`TikTok trả về ${result.status}${result.fail_reason ? `: ${result.fail_reason}` : ''}`)
      }
      db.updateVideo(video.id, { status: 'published', publishedAt: new Date().toISOString(), force: false })
      db.log('success', `Đã đăng "${video.title || video.originalName}"`, video.id)
    } catch (err) {
      if (RETRYABLE_CODES.has(err.code)) {
        const retryAt = new Date(Date.now() + RETRY_DELAY_MIN * 60_000).toISOString()
        db.updateVideo(video.id, { status: 'scheduled', scheduledAt: retryAt, lastError: err.message })
        db.log('warn', `TikTok giới hạn tần suất, thử lại lúc ${new Date(retryAt).toLocaleString('vi-VN')}`, video.id)
      } else {
        db.updateVideo(video.id, { status: 'failed', force: false, lastError: err.message })
        db.log('error', `Đăng thất bại: ${err.message}`, video.id)
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
      db.log('error', `Lỗi bộ lập lịch: ${err.message}`)
    } finally {
      running = false
    }
  }

  return {
    tick: safeTick,
    start() {
      // Video đang "publishing" lúc server tắt → không biết kết quả, đánh dấu lỗi để người dùng kiểm tra
      for (const v of db.allVideos().filter((v) => v.status === 'publishing')) {
        db.updateVideo(v.id, { status: 'failed', force: false, lastError: 'Server tắt khi đang đăng, hãy kiểm tra trên TikTok trước khi đăng lại' })
      }
      timer = setInterval(safeTick, intervalMs)
      safeTick()
    },
    stop: () => clearInterval(timer),
  }
}
