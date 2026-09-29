import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import readline from 'node:readline/promises'
import { config, requireCredentials } from './config.mjs'

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      ...params,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Lỗi lấy token: ${json.error || res.status} ${json.error_description || ''}`.trim())
  }
  const now = Date.now()
  return {
    ...json,
    expires_at: now + json.expires_in * 1000,
    refresh_expires_at: now + json.refresh_expires_in * 1000,
  }
}

export function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(config.tokenFile, 'utf8'))
  } catch {
    return null
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(config.tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 })
}

export async function getAccessToken() {
  requireCredentials()
  const tokens = loadTokens()
  if (!tokens) throw new Error('Chưa đăng nhập. Chạy: node src/cli.mjs login')
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token
  if (tokens.refresh_expires_at <= Date.now()) {
    throw new Error('Refresh token đã hết hạn. Chạy lại: node src/cli.mjs login')
  }
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
  saveTokens(fresh)
  return fresh.access_token
}

function waitForCallback(redirect, state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirect)
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end()
        return
      }
      const ok = url.searchParams.get('state') === state && url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(ok ? 'Đăng nhập thành công, có thể đóng tab này.' : 'Đăng nhập thất bại, xem terminal.')
      server.close()
      if (ok) resolve(url.searchParams.get('code'))
      else reject(new Error(`Callback không hợp lệ: ${url.searchParams.get('error_description') || url.search}`))
    })
    server.on('error', reject)
    server.listen(Number(redirect.port) || 80, redirect.hostname)
  })
}

function codeFromAnswer(answer, state) {
  answer = answer.trim()
  if (!answer.includes('code=')) return decodeURIComponent(answer)
  const params = new URL(answer).searchParams
  if (params.get('state') !== state) throw new Error('State không khớp, hãy thử lại.')
  return params.get('code')
}

/**
 * Redirect URI là callback Worker (https): hỏi Worker mã theo `state` mỗi 2 giây.
 * Worker không có KV / không hỗ trợ thì dừng hỏi, chỉ chờ người dùng dán URL.
 */
export async function pollWorker(redirect, state, signal) {
  const pollUrl = new URL(`${redirect.pathname.replace(/\/$/, '')}/poll`, redirect.origin)
  pollUrl.searchParams.set('state', state)
  while (!signal.aborted) {
    try {
      const res = await fetch(pollUrl, { signal })
      if (res.status === 200) return (await res.json()).code
      if (res.status !== 202) return new Promise(() => {}) // không hỗ trợ → chờ dán tay
    } catch {
      if (signal.aborted) break
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return new Promise(() => {})
}

async function promptForCode(redirect, state) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ac = new AbortController()
  try {
    return await Promise.race([
      pollWorker(redirect, state, ac.signal).then((code) => {
        console.log('\nĐã nhận mã từ callback Worker.')
        return code
      }),
      rl
        .question('Đang chờ callback… (hoặc dán URL bạn được chuyển tới / mã code rồi Enter): ', { signal: ac.signal })
        .then(
          (answer) => codeFromAnswer(answer, state),
          // Worker trả mã trước → câu hỏi bị huỷ, bỏ qua
          (err) => (err.name === 'AbortError' ? new Promise(() => {}) : Promise.reject(err)),
        ),
    ])
  } finally {
    ac.abort()
    rl.close()
  }
}

export async function login() {
  requireCredentials()
  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: 'code',
    scope: config.scopes,
    redirect_uri: config.redirectUri,
    state,
  })
  let verifier
  if (config.usePkce) {
    verifier = crypto.randomBytes(48).toString('base64url')
    // TikTok desktop PKCE dùng SHA256 dạng hex, không phải base64url như chuẩn RFC 7636
    params.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('hex'))
    params.set('code_challenge_method', 'S256')
  }

  console.log(`\nMở link sau trong trình duyệt để cấp quyền:\n\n${AUTHORIZE_URL}?${params}\n`)
  console.log(`Redirect URI: ${config.redirectUri} · PKCE: ${config.usePkce ? 'bật' : 'tắt'} · Scope: ${config.scopes}`)
  console.log('(Redirect URI phải khớp Y HỆT URI khai báo trong app TikTok)\n')

  const redirect = new URL(config.redirectUri)
  const isLocal = ['localhost', '127.0.0.1'].includes(redirect.hostname)
  const code = isLocal ? await waitForCallback(redirect, state) : await promptForCode(redirect, state)

  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    ...(verifier && { code_verifier: verifier }),
  })
  saveTokens(tokens)
  console.log(`Đăng nhập OK (open_id: ${tokens.open_id}, scope: ${tokens.scope}).`)
}
