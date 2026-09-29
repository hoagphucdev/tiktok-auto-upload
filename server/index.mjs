import path from 'node:path'
import { ROOT } from '../src/config.mjs'
import { logAction } from '../src/logger.mjs'
import { createApp } from './app.mjs'
import { createChannelCache } from './channel-cache.mjs'
import { createPublisher, SETTING_DEFAULTS } from './publisher.mjs'
import { createScheduler } from './scheduler.mjs'
import { createPendingStore, createSettingsStore } from './store.mjs'

const PORT = Number(process.env.PORT || 8787)
// Mặc định chỉ nghe trên máy này; đặt HOST=0.0.0.0 để mở ra mạng LAN (khi đó nên đặt ADMIN_PASSWORD)
const HOST = process.env.HOST || '127.0.0.1'
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data')

const store = createPendingStore(DATA_DIR)
const settings = createSettingsStore(DATA_DIR, SETTING_DEFAULTS)
const lock = { busy: null }
const publisher = createPublisher(store, settings)
const channel = createChannelCache({ fetchChannel: publisher.fetchChannel, lock, getSettings: settings.get })
const scheduler = createScheduler({
  store,
  getSettings: settings.get,
  publish: publisher.publish,
  lock,
  onPublished: () => channel.invalidate(),
})

const app = createApp({
  store,
  settings,
  channel,
  scheduler,
  publisher,
  lock,
  password: process.env.ADMIN_PASSWORD,
  staticDir: path.join(ROOT, 'web', 'dist'),
})

app.set('trust proxy', 'loopback')
app.listen(PORT, HOST, () => {
  scheduler.start()
  logAction({ actor: 'system', action: 'start', message: `Khởi động server tại ${HOST}:${PORT}` })
  console.log(`TikTok Manager đang chạy: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  if (HOST !== '127.0.0.1' && !process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  Đang mở ra mạng mà chưa đặt ADMIN_PASSWORD — ai cùng mạng cũng vào được.')
  }
})
