import { launch } from './browser.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (...vals) => {
  for (const v of vals) if (v != null && v !== '' && !Number.isNaN(Number(v))) return Number(v)
  return 0
}

export const PROFILE_URL = (username) =>
  process.env.TIKTOK_PROFILE_URL?.replace('{username}', username) || `https://www.tiktok.com/@${username}?lang=en`

/** Chuẩn hoá 1 item từ API web của TikTok thành dữ liệu hiển thị. */
export function normalizeVideo(item, username) {
  const stats = item.statsV2 || item.stats || {}
  const s = item.stats || {}
  const video = item.video || {}
  const hashtags = [
    ...new Set([
      ...(item.textExtra || []).map((t) => t.hashtagName).filter(Boolean),
      ...(item.challenges || []).map((c) => c.title).filter(Boolean),
    ]),
  ]
  return {
    id: String(item.id),
    url: `https://www.tiktok.com/@${username}/video/${item.id}`,
    embedUrl: `https://www.tiktok.com/player/v1/${item.id}?description=1&music_info=1`,
    caption: item.desc || '',
    hashtags,
    createdAt: item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : null,
    duration: num(video.duration),
    width: num(video.width),
    height: num(video.height),
    cover: video.cover || video.originCover || video.dynamicCover || null,
    private: Boolean(item.privateItem),
    pinned: Boolean(item.isPinnedItem),
    isAd: Boolean(item.isAd),
    music: item.music ? [item.music.title, item.music.authorName].filter(Boolean).join(' — ') : '',
    stats: {
      views: num(stats.playCount, s.playCount),
      likes: num(stats.diggCount, s.diggCount),
      comments: num(stats.commentCount, s.commentCount),
      shares: num(stats.shareCount, s.shareCount),
      saves: num(stats.collectCount, s.collectCount),
    },
  }
}

export function normalizeUser(userInfo) {
  const u = userInfo.user || {}
  const st = userInfo.statsV2 || userInfo.stats || {}
  const s = userInfo.stats || {}
  return {
    id: u.id,
    username: u.uniqueId,
    nickname: u.nickname,
    avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
    bio: u.signature || '',
    verified: Boolean(u.verified),
    privateAccount: Boolean(u.privateAccount),
    url: `https://www.tiktok.com/@${u.uniqueId}`,
    stats: {
      followers: num(st.followerCount, s.followerCount),
      following: num(st.followingCount, s.followingCount),
      likes: num(st.heartCount, st.heart, s.heartCount, s.heart),
      videos: num(st.videoCount, s.videoCount),
    },
  }
}

/**
 * Lấy thông tin kênh + danh sách video trực tiếp từ TikTok bằng trình duyệt đã đăng nhập
 * (khi xem kênh của chính mình sẽ thấy cả video riêng tư).
 * Không lưu gì xuống đĩa: dữ liệu được đọc từ trang hồ sơ và các response /api/post/item_list/
 * mà trang tự tải khi cuộn.
 */
export async function fetchChannel({ username, maxVideos = 100, timeoutMs = 90_000 }) {
  username = String(username || '').replace(/^@/, '').trim()
  if (!username) throw Object.assign(new Error('Chưa đặt tên kênh TikTok (@username) trong Cài đặt'), { status: 400 })

  const { page, close } = await launch()
  const items = new Map()
  let listSeen = false
  let hasMore = true
  page.on('response', async (res) => {
    if (!res.url().includes('/api/post/item_list')) return
    try {
      const json = await res.json()
      listSeen = true
      for (const it of json.itemList || []) items.set(String(it.id), it)
      hasMore = Boolean(json.hasMore)
    } catch {
      // response rỗng/không phải JSON: bỏ qua
    }
  })

  try {
    await page.goto(PROFILE_URL(username), { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((err) => {
      throw new Error(`Không mở được trang kênh @${username} trên TikTok (${err.message.split('\n')[0].replace(/^page\.goto: /, '')})`)
    })
    const raw = await page
      .locator('#__UNIVERSAL_DATA_FOR_REHYDRATION__')
      .textContent({ timeout: 30_000 })
      .catch(() => null)
    if (!raw) throw new Error('Không đọc được trang kênh TikTok (có thể đang hiện captcha — mở trình duyệt và giải captcha)')
    const detail = JSON.parse(raw).__DEFAULT_SCOPE__?.['webapp.user-detail']
    if (!detail?.userInfo?.user?.uniqueId) {
      throw new Error(`Không tìm thấy kênh @${username} (TikTok statusCode ${detail?.statusCode ?? '?'})`)
    }
    const user = normalizeUser(detail.userInfo)

    // Cuộn để trang tải thêm video cho tới khi đủ, hết, hoặc hết giờ
    const deadline = Date.now() + timeoutMs
    let idle = 0
    while (Date.now() < deadline && items.size < maxVideos && user.stats.videos > 0) {
      const before = items.size
      await page.mouse.wheel(0, 5000)
      await sleep(1500)
      if (listSeen && !hasMore) break
      idle = items.size === before ? idle + 1 : 0
      if (idle >= (listSeen ? 4 : 12)) break
    }
    if (user.stats.videos > 0 && items.size === 0) {
      throw new Error('Không tải được danh sách video từ TikTok (có thể đang hiện captcha hoặc bị giới hạn) — thử lại sau')
    }

    const videos = [...items.values()]
      .map((it) => normalizeVideo(it, user.username))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, maxVideos)

    return { user, videos, complete: !hasMore || videos.length >= user.stats.videos, fetchedAt: new Date().toISOString() }
  } finally {
    await close()
  }
}
