import { config } from '../src/config.mjs'
import { browserLoginAuto } from '../src/browser.mjs'
import { publishVideo } from '../src/upload.mjs'

export const SETTING_DEFAULTS = {
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

// Cài đặt trên web ghi đè cấu hình .env cho các lần đăng sau
function applySettings(s) {
  Object.assign(config, {
    method: s.method,
    browser: s.browser,
    chromiumPath: s.chromiumPath,
    cdpUrl: s.cdpUrl,
    headless: s.headless,
  })
}

export function createPublisher(db) {
  return {
    publish(video, settings) {
      applySettings(settings)
      return publishVideo({
        file: db.filePath(video),
        caption: video.caption,
        privacy: video.privacy || settings.privacy,
        mode: 'direct',
      })
    },
    login(settings) {
      applySettings(settings)
      if (settings.method === 'api') {
        throw Object.assign(new Error('Chế độ API: chạy "node src/cli.mjs login --api" trong terminal để đăng nhập OAuth'), { status: 400 })
      }
      return browserLoginAuto()
    },
  }
}
