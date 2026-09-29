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

const BRAVE_PATHS = {
  win32: [
    `${process.env.PROGRAMFILES}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
  ],
  darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
  linux: ['/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave', '/opt/brave.com/brave/brave'],
}

export function resolveExecutable() {
  if (config.chromiumPath) return config.chromiumPath
  if (config.browser !== 'brave') return undefined
  const found = (BRAVE_PATHS[process.platform] || []).find((p) => fs.existsSync(p))
  if (!found) throw new Error('Không tìm thấy Brave. Đặt CHROMIUM_PATH trỏ tới file chạy của Brave trong .env')
  return found
}

/**
 * Trả về { page, close }.
 * - BROWSER_CDP_URL có giá trị → mở tab mới trong Brave/Chrome bạn đang mở sẵn
 * - ngược lại → tự mở trình duyệt riêng với profile .browser-profile/
 */
export async function launch({ headless = config.headless } = {}) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Chưa cài Playwright. Chạy: npm run setup')
  }

  if (config.cdpUrl) {
    const browser = await chromium.connectOverCDP(config.cdpUrl).catch((err) => {
      throw new Error(
        `Không kết nối được trình duyệt tại ${config.cdpUrl}. Hãy mở Brave với --remote-debugging-port (xem README). (${err.message})`,
      )
    })
    const page = await browser.contexts()[0].newPage()
    return {
      page,
      // Chỉ đóng tab tool đã mở và ngắt kết nối, không đóng trình duyệt của bạn
      close: async () => {
        await page.close().catch(() => {})
        await browser.close().catch(() => {})
      },
    }
  }

  const executablePath = resolveExecutable()
  const ctx = await chromium.launchPersistentContext(config.profileDir, {
    headless,
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    ...(executablePath && { executablePath }),
  })
  return { page: ctx.pages()[0] || (await ctx.newPage()), close: () => ctx.close() }
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
  const { page, close } = await launch({ headless: false })
  await page.goto(LOGIN_URL)
  console.log('Hãy đăng nhập TikTok trong cửa sổ trình duyệt vừa mở (QR code, email, số điện thoại…).')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('Đăng nhập xong thì nhấn Enter tại đây… ')
  rl.close()
  await close()
  if (!config.cdpUrl) console.log(`Đã lưu phiên đăng nhập vào ${config.profileDir}`)
}

/**
 * Đăng nhập không cần terminal (dùng cho web app): mở trang đăng nhập và tự đóng khi thấy
 * cookie phiên TikTok (sessionid) xuất hiện.
 */
export async function browserLoginAuto({ timeoutMs = 10 * 60_000 } = {}) {
  const { page, close } = await launch({ headless: false })
  try {
    await page.goto(LOGIN_URL)
    await waitUntil(
      async () => (await page.context().cookies('https://www.tiktok.com')).some((c) => c.name === 'sessionid' && c.value),
      timeoutMs,
      'Hết thời gian chờ đăng nhập TikTok',
    )
    await sleep(2000)
  } finally {
    await close()
  }
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
  const { page, close } = await launch()
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
    await close()
  }
}
