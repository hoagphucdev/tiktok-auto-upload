#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { config } from './config.mjs'
import { getAccessToken, login } from './auth.mjs'
import { browserLogin } from './browser.mjs'
import { fetchPublishStatus, queryCreatorInfo } from './api.mjs'
import { publishVideo } from './upload.mjs'
import { runQueue, watchQueue } from './queue.mjs'

const HELP = `
TikTok auto uploader

Cách dùng:
  node src/cli.mjs login                     Đăng nhập TikTok (mở trình duyệt, hoặc OAuth nếu --api)
  node src/cli.mjs whoami                    [API] Xem thông tin tài khoản & quyền đăng
  node src/cli.mjs upload <file> [options]   Upload 1 video
  node src/cli.mjs queue [--max N] [--gap S] Upload các video trong thư mục queue
  node src/cli.mjs watch [--interval MIN]    Chạy liên tục, mỗi MIN phút đăng 1 video
  node src/cli.mjs status <publish_id>       [API] Kiểm tra trạng thái 1 lần đăng

Mặc định dùng trình duyệt (không cần key). Thêm --api để dùng Content Posting API.

Options cho upload:
  -c, --caption <text>     Caption + hashtag
  -p, --privacy <level>    PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY
      --draft              [API] Gửi vào nháp (inbox) thay vì đăng thẳng
      --no-comment         [API] Tắt bình luận
      --no-duet            [API] Tắt duet
      --no-stitch          [API] Tắt stitch
      --cover-ms <ms>      [API] Frame làm ảnh bìa (mili giây)
      --no-wait            [API] Không chờ TikTok xử lý xong
      --api                Dùng Content Posting API thay cho trình duyệt
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
    api: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, arg] = positionals
if (values.api) config.method = 'api'

async function main() {
  switch (command) {
    case 'login':
      return config.method === 'api' ? login() : browserLogin()
    case 'whoami':
      return console.log(await queryCreatorInfo(await getAccessToken()))
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
      if (result.status === 'FAILED' || result.status === 'TIMEOUT') process.exitCode = 1
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
  process.exit(1)
})
