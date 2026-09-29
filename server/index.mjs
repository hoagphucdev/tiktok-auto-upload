import path from 'node:path'
import { ROOT } from '../src/config.mjs'
import { createApp } from './app.mjs'
import { createDb } from './db.mjs'
import { createPublisher, SETTING_DEFAULTS } from './publisher.mjs'
import { createScheduler } from './scheduler.mjs'

const PORT = Number(process.env.PORT || 8787)
// Mặc định chỉ nghe trên máy này; đặt HOST=0.0.0.0 để mở ra mạng LAN (khi đó nên đặt ADMIN_PASSWORD)
const HOST = process.env.HOST || '127.0.0.1'

const db = createDb(path.resolve(ROOT, process.env.DATA_DIR || 'data'), SETTING_DEFAULTS)
const lock = { busy: null }
const publisher = createPublisher(db)
const scheduler = createScheduler({ db, publish: publisher.publish, lock })

const app = createApp({
  db,
  scheduler,
  publisher,
  lock,
  password: process.env.ADMIN_PASSWORD,
  staticDir: path.join(ROOT, 'web', 'dist'),
})

app.listen(PORT, HOST, () => {
  scheduler.start()
  console.log(`TikTok Manager đang chạy: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  if (HOST !== '127.0.0.1' && !process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  Đang mở ra mạng mà chưa đặt ADMIN_PASSWORD — ai cùng mạng cũng vào được.')
  }
})
