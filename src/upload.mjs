import fs from 'node:fs'
import path from 'node:path'
import { getAccessToken, loadTokens } from './auth.mjs'
import { config } from './config.mjs'
import { fetchPublishStatus, initDirectPost, initInboxUpload, queryCreatorInfo } from './api.mjs'

const MB = 1024 * 1024
const MIN_CHUNK = 5 * MB
const MAX_CHUNK = 64 * MB
const DEFAULT_CHUNK = 10 * MB
const MAX_CAPTION = 2200

const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }
export const VIDEO_EXTS = Object.keys(MIME)

/**
 * Chia file theo luật của TikTok: mỗi chunk 5–64MB, chunk cuối gánh phần dư
 * (tối đa 128MB), file ≤ 64MB gửi 1 lần.
 */
export function planChunks(size, chunkSize = DEFAULT_CHUNK) {
  if (size <= 0) throw new Error('File video rỗng')
  if (size <= MAX_CHUNK) return { chunkSize: size, count: 1 }
  chunkSize = Math.min(Math.max(chunkSize, MIN_CHUNK), MAX_CHUNK)
  const count = Math.floor(size / chunkSize)
  if (count > 1000) throw new Error('File quá lớn (vượt 1000 chunk)')
  return { chunkSize, count }
}

export function chunkRanges(size, { chunkSize, count }) {
  return Array.from({ length: count }, (_, i) => {
    const start = i * chunkSize
    const end = i === count - 1 ? size - 1 : start + chunkSize - 1
    return { start, end }
  })
}

async function putChunk(uploadUrl, fd, { start, end }, size, mime) {
  const length = end - start + 1
  const buf = Buffer.alloc(length)
  await fd.read(buf, 0, length, start)
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mime,
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
      body: buf,
    })
    if (res.ok) return
    if (attempt >= 3) throw new Error(`Upload chunk ${start}-${end} lỗi: HTTP ${res.status} ${await res.text()}`)
    await sleep(2000 * attempt)
  }
}

async function uploadFile(uploadUrl, file, size, plan) {
  const mime = MIME[path.extname(file).toLowerCase()]
  const fd = await fs.promises.open(file, 'r')
  try {
    const ranges = chunkRanges(size, plan)
    for (const [i, range] of ranges.entries()) {
      await putChunk(uploadUrl, fd, range, size, mime)
      console.log(`  chunk ${i + 1}/${ranges.length} OK`)
    }
  } finally {
    await fd.close()
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TERMINAL = new Set(['PUBLISH_COMPLETE', 'FAILED', 'SEND_TO_USER_INBOX'])

export async function waitForPublish(token, publishId, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fetchPublishStatus(token, publishId)
    if (TERMINAL.has(last.status)) return last
    await sleep(5000)
  }
  return { ...last, status: last?.status || 'TIMEOUT' }
}

/**
 * Upload 1 video.
 * mode 'direct' → đăng thẳng lên profile (scope video.publish)
 * mode 'inbox'  → gửi vào mục nháp/thông báo TikTok để tự bấm đăng (scope video.upload)
 */
export async function publishVideo({
  file,
  caption = '',
  mode = 'direct',
  privacy = 'SELF_ONLY',
  disableComment = false,
  disableDuet = false,
  disableStitch = false,
  coverMs,
  wait = true,
}) {
  if (!VIDEO_EXTS.includes(path.extname(file).toLowerCase())) {
    throw new Error(`Định dạng không hỗ trợ: ${file} (chỉ ${VIDEO_EXTS.join(', ')})`)
  }
  if (caption.length > MAX_CAPTION) throw new Error(`Caption dài ${caption.length} ký tự, tối đa ${MAX_CAPTION}`)

  const size = (await fs.promises.stat(file)).size
  const plan = planChunks(size)
  const sourceInfo = {
    source: 'FILE_UPLOAD',
    video_size: size,
    chunk_size: plan.chunkSize,
    total_chunk_count: plan.count,
  }
  const token = await getAccessToken()

  // Chưa bật Direct Post (token không có video.publish) → chỉ gửi được vào hộp nháp TikTok
  const scopes = String(loadTokens()?.scope || '').split(/[,\s]+/)
  if (mode === 'direct' && !scopes.includes('video.publish')) {
    console.warn('⚠ Token không có quyền video.publish → gửi vào hộp nháp TikTok (mở app TikTok để soạn caption và bấm Đăng).')
    mode = 'inbox'
  }

  let init
  if (mode === 'direct') {
    const creator = await queryCreatorInfo(token)
    if (!creator.privacy_level_options?.includes(privacy)) {
      throw new Error(
        `Privacy "${privacy}" không được phép cho tài khoản này. Cho phép: ${creator.privacy_level_options?.join(', ')}`,
      )
    }
    try {
      init = await initDirectPost(
        token,
        {
          title: caption,
          privacy_level: privacy,
          disable_comment: disableComment || creator.comment_disabled,
          disable_duet: disableDuet || creator.duet_disabled,
          disable_stitch: disableStitch || creator.stitch_disabled,
          ...(coverMs != null && { video_cover_timestamp_ms: Number(coverMs) }),
        },
        sourceInfo,
      )
    } catch (err) {
      // App chưa được TikTok duyệt chỉ đăng thẳng được lên tài khoản đang để riêng tư
      if (err.code !== 'unaudited_client_can_only_post_to_private_accounts') throw err
      console.warn(
        '⚠ App chưa được TikTok duyệt nên chỉ đăng thẳng được khi tài khoản TikTok để "riêng tư" → gửi vào hộp nháp thay thế.',
      )
      mode = 'inbox'
    }
  }
  if (mode === 'inbox') init = await initInboxUpload(token, sourceInfo)

  console.log(`→ ${path.basename(file)} (${(size / MB).toFixed(1)}MB, ${plan.count} chunk) publish_id=${init.publish_id}`)
  await uploadFile(init.upload_url, file, size, plan)

  if (!wait) return { publish_id: init.publish_id, mode, status: 'UPLOADED' }
  const status = await waitForPublish(token, init.publish_id)
  return { publish_id: init.publish_id, mode, ...status }
}
