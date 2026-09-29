import { getUserInfo, listVideos } from './api.mjs'
import { getAccessToken, loadTokens } from './auth.mjs'

// Trường nào cần scope nào (xin trường mà token không có scope sẽ bị TikTok từ chối)
const USER_FIELDS = {
  'user.info.basic': ['open_id', 'avatar_url', 'avatar_large_url', 'display_name'],
  'user.info.profile': ['username', 'bio_description', 'profile_deep_link', 'is_verified'],
  'user.info.stats': ['follower_count', 'following_count', 'likes_count', 'video_count'],
}
const VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'embed_link',
  'share_url',
  'create_time',
  'height',
  'width',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
]

const scopeError = (scope, what) =>
  Object.assign(
    new Error(
      `Token chưa có quyền ${scope} để ${what}. Thêm scope này cho app trên developers.tiktok.com, ` +
        `thêm vào TIKTOK_SCOPES trong .env, rồi chạy lại: node src/cli.mjs login --api`,
    ),
    { status: 400 },
  )

export function normalizeApiVideo(v, username) {
  const url = v.share_url || (username ? `https://www.tiktok.com/@${username}/video/${v.id}` : `https://www.tiktok.com/video/${v.id}`)
  const caption = v.video_description || v.title || ''
  return {
    id: String(v.id),
    url,
    embedUrl: `https://www.tiktok.com/player/v1/${v.id}?description=1&music_info=1`,
    caption,
    hashtags: [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1)))],
    createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    duration: v.duration || 0,
    width: v.width || 0,
    height: v.height || 0,
    cover: v.cover_image_url || null,
    // Display API chỉ trả video công khai và không có các trường dưới
    private: false,
    pinned: false,
    isAd: false,
    music: '',
    stats: {
      views: v.view_count ?? 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
      saves: null,
    },
  }
}

/**
 * Lấy thông tin kênh + video qua Display API chính thức (không cần trình duyệt, không captcha).
 * Cần đã đăng nhập bằng `node src/cli.mjs login --api`.
 */
export async function fetchChannelApi({ maxVideos = 100 } = {}) {
  const token = await getAccessToken()
  const scopes = new Set(String(loadTokens()?.scope || '').split(/[,\s]+/).filter(Boolean))

  const fields = Object.entries(USER_FIELDS).flatMap(([scope, f]) => (scopes.has(scope) ? f : []))
  if (!fields.length) throw scopeError('user.info.basic', 'đọc thông tin tài khoản')
  const { user: u } = await getUserInfo(token, fields)

  const username = u.username || ''
  const user = {
    id: u.open_id,
    username,
    nickname: u.display_name,
    avatar: u.avatar_large_url || u.avatar_url || null,
    bio: u.bio_description || '',
    verified: Boolean(u.is_verified),
    privateAccount: false,
    url: u.profile_deep_link || (username ? `https://www.tiktok.com/@${username}` : null),
    stats: {
      followers: u.follower_count ?? null,
      following: u.following_count ?? null,
      likes: u.likes_count ?? null,
      videos: u.video_count ?? null,
    },
  }

  const warnings = []
  if (!scopes.has('user.info.stats')) warnings.push('Thiếu scope user.info.stats nên không có số người theo dõi / lượt thích.')
  if (!scopes.has('video.list')) {
    warnings.push('Thiếu scope video.list nên không đọc được danh sách video.')
    return { user, videos: [], complete: true, source: 'api', warnings, fetchedAt: new Date().toISOString() }
  }
  const videos = []
  let cursor
  let hasMore = true
  while (hasMore && videos.length < maxVideos) {
    const page = await listVideos(token, VIDEO_FIELDS, { cursor, maxCount: Math.min(20, maxVideos - videos.length) })
    videos.push(...(page.videos || []).map((v) => normalizeApiVideo(v, username)))
    hasMore = Boolean(page.has_more) && Boolean(page.cursor)
    cursor = page.cursor
  }

  return { user, videos, complete: !hasMore, source: 'api', warnings, fetchedAt: new Date().toISOString() }
}
