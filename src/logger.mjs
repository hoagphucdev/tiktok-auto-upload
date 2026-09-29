import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './config.mjs'

/**
 * Nhật ký thao tác dạng text, mỗi ngày 1 file: <LOG_DIR>/YYYY-MM-DD.txt
 * Mỗi dòng:  2026-09-29 13:10:05 | INFO  | web       | upload     | Nội dung | video=abc
 * Dùng chung cho web app (actor "web", "scheduler") và CLI (actor "cli").
 */
export const LOG_DIR = path.resolve(ROOT, process.env.LOG_DIR || path.join(process.env.DATA_DIR || 'data', 'logs'))
export const LEVELS = ['info', 'success', 'warn', 'error']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const pad = (n) => String(n).padStart(2, '0')
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
// Giữ mỗi mục trên 1 dòng và không phá dấu phân cách cột
const clean = (s) =>
  String(s ?? '')
    .replace(/\x1b\[[0-9;]*m/g, '') // mã màu terminal
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '/')
    .trim()

export function logAction({ level = 'info', actor = 'system', action = '-', message, target } = {}) {
  const now = new Date()
  const line = [
    `${localDay(now)} ${localTime(now)}`,
    level.toUpperCase().padEnd(7),
    clean(actor).padEnd(9),
    clean(action).padEnd(10),
    clean(message),
    clean(target),
  ].join(' | ')
  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.appendFileSync(path.join(LOG_DIR, `${localDay(now)}.txt`), `${line}\n`)
  return parseLine(line)
}

export function parseLine(line) {
  const [at, level, actor, action, message, target] = line.split(' | ').map((s) => s.trim())
  if (!message && message !== '') return null
  return { at, level: level.toLowerCase(), actor, action, message, target: target || '' }
}

export const logFile = (day) => {
  if (!DAY_RE.test(day)) throw Object.assign(new Error('Ngày không hợp lệ (YYYY-MM-DD)'), { status: 400 })
  return path.join(LOG_DIR, `${day}.txt`)
}

export function listLogDays() {
  if (!fs.existsSync(LOG_DIR)) return []
  return fs
    .readdirSync(LOG_DIR)
    .filter((f) => DAY_RE.test(f.replace(/\.txt$/, '')) && f.endsWith('.txt'))
    .map((f) => ({ day: f.slice(0, 10), size: fs.statSync(path.join(LOG_DIR, f)).size }))
    .sort((a, b) => b.day.localeCompare(a.day))
}

/** Đọc log 1 ngày, mới nhất trước. */
export function readLog(day = localDay()) {
  const file = logFile(day)
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean)
    .reverse()
}
