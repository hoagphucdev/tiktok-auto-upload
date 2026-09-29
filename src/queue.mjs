import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.mjs'
import { publishVideo, VIDEO_EXTS } from './upload.mjs'

/**
 * Cấu trúc thư mục queue:
 *   queue/video1.mp4
 *   queue/video1.json   (tuỳ chọn) {"caption","privacy","mode","publishAt",...}
 *   queue/video1.txt    (tuỳ chọn) chỉ chứa caption
 *   queue/done/, queue/failed/, queue/log.jsonl  (tool tự tạo)
 */
export function readMeta(videoPath) {
  const base = videoPath.slice(0, -path.extname(videoPath).length)
  let meta = {}
  if (fs.existsSync(`${base}.json`)) meta = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'))
  if (meta.caption == null && fs.existsSync(`${base}.txt`)) meta.caption = fs.readFileSync(`${base}.txt`, 'utf8').trim()
  return meta
}

export function listPending(dir = config.queueDir, now = Date.now()) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXTS.includes(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => {
      const file = path.join(dir, f)
      return { file, meta: readMeta(file) }
    })
    .filter(({ meta }) => !meta.publishAt || new Date(meta.publishAt).getTime() <= now)
}

function moveWithSidecars(file, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const base = file.slice(0, -path.extname(file).length)
  for (const f of [file, `${base}.json`, `${base}.txt`]) {
    if (fs.existsSync(f)) fs.renameSync(f, path.join(destDir, path.basename(f)))
  }
}

function log(entry) {
  fs.appendFileSync(path.join(config.queueDir, 'log.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
}

async function processOne({ file, meta }) {
  try {
    const result = await publishVideo({
      file,
      mode: meta.mode || config.defaultMode,
      privacy: meta.privacy || config.defaultPrivacy,
      ...meta,
    })
    const ok = result.status !== 'FAILED' && result.status !== 'TIMEOUT'
    console.log(`${ok ? '✓' : '✗'} ${path.basename(file)}: ${result.status}${result.fail_reason ? ` (${result.fail_reason})` : ''}`)
    moveWithSidecars(file, path.join(config.queueDir, ok ? 'done' : 'failed'))
    log({ file: path.basename(file), ...result })
    return ok
  } catch (err) {
    console.error(`✗ ${path.basename(file)}: ${err.message}`)
    // Lỗi rate limit / mạng thì để lại trong queue để thử lần sau
    const retryable = err.code === 'rate_limit_exceeded' || err.code === 'spam_risk_too_many_posts' || !err.code
    if (!retryable) moveWithSidecars(file, path.join(config.queueDir, 'failed'))
    log({ file: path.basename(file), status: 'ERROR', error: err.message, retryable })
    return false
  }
}

/** Upload tối đa `max` video đang chờ, nghỉ `gapSec` giây giữa các video. */
export async function runQueue({ max = Infinity, gapSec = 30 } = {}) {
  fs.mkdirSync(config.queueDir, { recursive: true })
  const pending = listPending().slice(0, max)
  if (!pending.length) {
    console.log(`Không có video nào đang chờ trong ${config.queueDir}`)
    return
  }
  for (const [i, item] of pending.entries()) {
    await processOne(item)
    if (i < pending.length - 1) await new Promise((r) => setTimeout(r, gapSec * 1000))
  }
}

/** Chạy liên tục: mỗi `intervalMin` phút đăng 1 video tiếp theo trong queue. */
export async function watchQueue({ intervalMin = config.watchIntervalMin } = {}) {
  console.log(`Đang theo dõi ${config.queueDir}, mỗi ${intervalMin} phút đăng 1 video. Ctrl+C để dừng.`)
  for (;;) {
    await runQueue({ max: 1 })
    await new Promise((r) => setTimeout(r, intervalMin * 60_000))
  }
}
