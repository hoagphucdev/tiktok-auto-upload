import { config } from '../src/config.mjs'
import { startLogin, tokenStatus } from '../src/auth.mjs'
import { fetchChannelApi } from '../src/channel-api.mjs'
import { publishVideo } from '../src/upload.mjs'

export const SETTING_DEFAULTS = {
  maxVideos: 100,
  privacy: config.defaultPrivacy,
  gapMinutes: 60,
  dailyLimit: 10,
  paused: false,
  hashtagSets: [],
}

/** Mọi thao tác với TikTok đi qua API chính thức (Content Posting API + Display API). */
export function createPublisher(store) {
  return {
    publish(video, s) {
      return publishVideo({
        file: store.filePath(video),
        caption: video.caption,
        privacy: video.privacy || s.privacy,
        mode: 'direct', // tự chuyển sang hộp nháp nếu token không có video.publish
      })
    },
    // Trả link cấp quyền ngay; `done` xong khi callback (localhost hoặc Worker) trả mã và đã lưu token
    startLogin: () => startLogin(),
    authStatus: () => tokenStatus(),
    fetchChannel: (opts) => fetchChannelApi(opts),
  }
}
