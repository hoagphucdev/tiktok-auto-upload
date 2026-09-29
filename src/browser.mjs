import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { config, ROOT } from './config.mjs'

// lang=en để giao diện luôn là tiếng Anh, selector theo chữ mới ổn định
const UPLOAD_URL = process.env.TIKTOK_UPLOAD_URL || 'https://www.tiktok.com/tiktokstudio/upload?from=upload&lang=en'
const LOGIN_URL = 'https://www.tiktok.com/login?lang=en'

const PRIVACY_LABEL = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  FOLLOWER_OF_CREATOR: 'Friends',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  SELF_ONLY: 'Only you',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch({ headless = config.headless } = {}) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Chưa cài Playwright. Chạy: npm run setup')
  }
  return chromium.launchPersistentContext(config.profileDir, {
    headless,
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    ...(config.chromiumPath && { executablePath: config.chromiumPath }),
  })
}

async function waitUntil(fn, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn().catch(() => false)) return
    await sleep(1000)
  }
  throw new Error(message)
}

/** Mở trình duyệt để bạn tự đăng nhập TikTok; phiên đăng nhập được lưu trong .browser-profile/ */
export async function browserLogin() {
  const ctx = await launch({ headless: false })
  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.goto(LOGIN_URL)
  console.log('Hãy đăng nhập TikTok trong cửa sổ trình duyệt vừa mở (QR code, email, số điện thoại…).')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('Đăng nhập xong thì nhấn Enter tại đây… ')
  rl.close()
  await ctx.close()
  console.log(`Đã lưu phiên đăng nhập vào ${config.profileDir}`)
}

async function typeCaption(page, caption) {
  const editor = page.locator('div[contenteditable="true"]').first()
  await editor.waitFor({ timeout: 60_000 })
  await editor.click()
  // TikTok tự điền tên file vào caption, xoá đi trước
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  const lines = caption.split('\n')
  for (const [i, line] of lines.entries()) {
    for (const word of line.split(/(\s+)/)) {
      await page.keyboard.type(word, { delay: 20 })
      // Chờ popup gợi ý hashtag/mention hiện ra rồi đóng lại bằng dấu cách tiếp theo
      if (/^[#@]/.test(word)) await sleep(800)
    }
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
}

async function setPrivacy(page, privacy) {
  const label = PRIVACY_LABEL[privacy]
  if (!label) throw new Error(`Privacy không hợp lệ: ${privacy}`)
  const trigger = page
    .locator('[role="combobox"], [class*="Select__trigger"], [class*="select-container"]')
    .filter({ hasText: /^(Everyone|Friends|Only you)$/ })
    .first()
  await trigger.waitFor({ timeout: 15_000 })
  if ((await trigger.innerText()).trim() === label) return
  await trigger.click()
  await page.getByRole('option', { name: label, exact: true }).or(page.getByText(label, { exact: true })).last().click()
  await waitUntil(
    async () => (await trigger.innerText()).trim() === label,
    5000,
    `Không chọn được chế độ "${label}", huỷ đăng để tránh đăng sai quyền riêng tư`,
  )
}

/** Đăng 1 video bằng cách điều khiển trang TikTok Studio. */
export async function browserPublish({ file, caption = '', privacy = 'SELF_ONLY', uploadTimeoutMs = 10 * 60_000 }) {
  const ctx = await launch()
  const page = ctx.pages()[0] || (await ctx.newPage())
  try {
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded' })
    const input = page.locator('input[type="file"]').first()
    await input.waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {
      throw new Error('Không thấy trang upload, có thể phiên đăng nhập đã hết hạn. Chạy: node src/cli.mjs login')
    })

    console.log(`→ ${path.basename(file)}: đang tải lên…`)
    await input.setInputFiles(path.resolve(file))

    await typeCaption(page, caption)
    await setPrivacy(page, privacy)

    const postBtn = page
      .locator('button[data-e2e="post_video_button"]')
      .or(page.getByRole('button', { name: 'Post', exact: true }))
      .first()
    await waitUntil(
      async () => (await postBtn.isEnabled()) && (await postBtn.getAttribute('aria-disabled')) !== 'true',
      uploadTimeoutMs,
      'Hết thời gian chờ video tải lên',
    )
    await postBtn.click()

    // TikTok đôi khi hỏi xác nhận khi đang kiểm tra nội dung
    const postNow = page.getByRole('button', { name: /Post now/i })
    if (await postNow.isVisible({ timeout: 5000 }).catch(() => false)) await postNow.click()

    await waitUntil(
      async () =>
        page.url().includes('/tiktokstudio/content') ||
        (await page.getByText(/video has been (uploaded|posted)|Manage your posts/i).first().isVisible()),
      120_000,
      'Không xác nhận được là đã đăng thành công',
    )
    return { status: 'PUBLISH_COMPLETE' }
  } catch (err) {
    const shotDir = path.join(ROOT, 'errors')
    fs.mkdirSync(shotDir, { recursive: true })
    const shot = path.join(shotDir, `${Date.now()}-${path.basename(file)}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    err.message += ` (ảnh chụp màn hình: ${shot})`
    throw err
  } finally {
    await ctx.close()
  }
}
