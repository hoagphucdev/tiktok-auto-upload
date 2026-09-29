#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { config } from './config.mjs'
import { getAccessToken, login } from './auth.mjs'
import { fetchPublishStatus, queryCreatorInfo } from './api.mjs'
import { publishVideo } from './upload.mjs'
import { runQueue, watchQueue } from './queue.mjs'
import { logAction } from './logger.mjs'
import { fetchChannelApi } from './channel-api.mjs'

const HELP = `
TikTok auto uploader

Cách dùng:
  node src/cli.mjs login                     Đăng nhập TikTok (OAuth, lưu token vào .tokens.json)
  node src/cli.mjs whoami                    Xem thông tin kênh, video gần nhất & quyền đăng
  node src/cli.mjs upload <file> [options]   Upload 1 video
  node src/cli.mjs queue [--max N] [--gap S] Upload các video trong thư mục queue
  node src/cli.mjs watch [--interval MIN]    Chạy liên tục, mỗi MIN phút đăng 1 video
  node src/cli.mjs status <publish_id>       Kiểm tra trạng thái 1 lần đăng

Dùng TikTok Content Posting API + Display API (cần client key trong .env).

Options cho upload:
  -c, --caption <text>     Caption + hashtag
  -p, --privacy <level>    PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY
      --draft              Gửi vào hộp nháp TikTok thay vì đăng thẳng
                           (tự bật khi token không có scope video.publish)
      --no-comment         Tắt bình luận
      --no-duet            Tắt duet
      --no-stitch          Tắt stitch
      --cover-ms <ms>      Frame làm ảnh bìa (mili giây)
      --no-wait            Không chờ TikTok xử lý xong
`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    caption: { type: 'string', short: 'c', default: '' },
    privacy: { type: 'string', short: 'p', default: config.defaultPrivacy },
    draft: { type: 'boolean', default: false },
    'no-comment': { type: 'boolean', default: false },
    'no-duet': { type: 'boolean', default: false },
    'no-stitch': { type: 'boolean', default: false },
    'cover-ms': { type: 'string' },
    'no-wait': { type: 'boolean', default: false },
    max: { type: 'string' },
    gap: { type: 'string', default: '30' },
    interval: { type: 'string' },
    // Giữ để lệnh cũ có "--api" vẫn chạy; giờ luôn dùng API
    api: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, arg] = positionals

async function main() {
  switch (command) {
    case 'login':
      return login()
    case 'whoami': {
      const token = await getAccessToken()
      const { user, videos, warnings = [], error } = await fetchChannelApi({ maxVideos: 5 }).catch((err) => ({ error: err.message }))
      if (error) console.log(`Thông tin kênh: ${error}`)
      for (const w of warnings) console.log(`⚠ ${w}`)
      if (user) {
        console.log(`Tài khoản: ${user.nickname}${user.username ? ` (@${user.username})` : ''}`)
        console.log(`Người theo dõi: ${user.stats.followers ?? '?'} · Lượt thích: ${user.stats.likes ?? '?'} · Video: ${user.stats.videos ?? '?'}`)
        for (const v of videos) console.log(`  - ${v.createdAt?.slice(0, 10)} ▶ ${v.stats.views} ♥ ${v.stats.likes}  ${v.caption.slice(0, 60)}`)
      }
      const creator = await queryCreatorInfo(token).catch((err) =>
        err.code === 'scope_not_authorized' ? 'chưa có scope video.publish (chỉ gửi vào nháp được: upload --draft)' : err.message,
      )
      console.log('Quyền đăng thẳng:', creator)
      return
    }
    case 'status':
      if (!arg) throw new Error('Thiếu publish_id')
      return console.log(await fetchPublishStatus(await getAccessToken(), arg))
    case 'upload': {
      if (!arg) throw new Error('Thiếu đường dẫn video')
      const result = await publishVideo({
        file: arg,
        caption: values.caption,
        privacy: values.privacy,
        mode: values.draft ? 'inbox' : config.defaultMode,
        disableComment: values['no-comment'],
        disableDuet: values['no-duet'],
        disableStitch: values['no-stitch'],
        coverMs: values['cover-ms'],
        wait: !values['no-wait'],
      })
      console.log(result)
      const failed = result.status === 'FAILED' || result.status === 'TIMEOUT'
      logAction({
        level: failed ? 'error' : 'success',
        actor: 'cli',
        action: 'publish',
        message: `${failed ? 'Đăng thất bại' : 'Đã đăng'} ${arg} (${result.status})`,
        target: values.caption.slice(0, 80),
      })
      if (failed) process.exitCode = 1
      return
    }
    case 'queue':
      return runQueue({ max: values.max ? Number(values.max) : Infinity, gapSec: Number(values.gap) })
    case 'watch':
      return watchQueue({ intervalMin: values.interval ? Number(values.interval) : undefined })
    default:
      console.log(HELP)
  }
}

main().catch((err) => {
  console.error(`Lỗi: ${err.message}`)
  logAction({ level: 'error', actor: 'cli', action: command || '-', message: err.message, target: arg })
  process.exit(1)
})
