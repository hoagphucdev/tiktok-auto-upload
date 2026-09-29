import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

loadDotEnv(path.join(ROOT, '.env'))

const env = (key, fallback) => process.env[key] || fallback
const resolve = (p) => path.resolve(ROOT, p)

export const config = {
  clientKey: env('TIKTOK_CLIENT_KEY', ''),
  clientSecret: env('TIKTOK_CLIENT_SECRET', ''),
  redirectUri: env('TIKTOK_REDIRECT_URI', 'http://localhost:3455/callback'),
  // TikTok bắt buộc PKCE với app Desktop; app Web bỏ qua nên bật mặc định
  usePkce: env('TIKTOK_USE_PKCE', '1') !== '0',
  scopes: env('TIKTOK_SCOPES', 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload'),
  defaultPrivacy: env('DEFAULT_PRIVACY', 'SELF_ONLY'),
  defaultMode: env('DEFAULT_MODE', 'direct'),
  tokenFile: resolve(env('TOKEN_FILE', '.tokens.json')),
  queueDir: resolve(env('QUEUE_DIR', './queue')),
  watchIntervalMin: Number(env('WATCH_INTERVAL_MIN', '60')),
}

export function requireCredentials() {
  if (!config.clientKey || !config.clientSecret) {
    throw new Error('Thiếu TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET. Copy .env.example thành .env và điền vào.')
  }
}
