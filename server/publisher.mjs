import { config } from '../src/config.mjs'
import { browserLoginAuto } from '../src/browser.mjs'
import { fetchChannel } from '../src/channel.mjs'
import { publishVideo } from '../src/upload.mjs'

export const SETTING_DEFAULTS = {
  username: process.env.TIKTOK_USERNAME || '',
  maxVideos: 100,
  method: config.method,
  privacy: config.defaultPrivacy,
  browser: config.browser,
  chromiumPath: config.chromiumPath,
  cdpUrl: config.cdpUrl,
  headless: config.headless,
  gapMinutes: 60,
  dailyLimit: 10,
  paused: false,
  hashtagSets: [],
  lastLoginAt: null,
}

// Cài đặt trên web ghi đè cấu hình .env cho các lần mở trình duyệt sau
function applySettings(s) {
  Object.assign(config, {
    method: s.method,
    browser: s.browser,
    chromiumPath: s.chromiumPath,
    cdpUrl: s.cdpUrl,
    headless: s.headless,
  })
}

export function createPublisher(store, settings) {
  return {
    publish(video, s) {
      applySettings(s)
      return publishVideo({
        file: store.filePath(video),
        caption: video.caption,
        privacy: video.privacy || s.privacy,
        mode: 'direct',
      })
    },
    login(s) {
      applySettings(s)
      if (s.method === 'api') {
        throw Object.assign(new Error('Chế độ API: chạy "node src/cli.mjs login --api" trong terminal để đăng nhập OAuth'), { status: 400 })
      }
      return browserLoginAuto()
    },
    fetchChannel(opts) {
      applySettings(settings.get())
      return fetchChannel(opts)
    },
  }
}
