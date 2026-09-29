import { useCallback, useEffect, useRef, useState } from 'react'

export const STATUS_LABEL = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Lỗi',
}

export const PRIVACY_LABEL = {
  PUBLIC_TO_EVERYONE: 'Mọi người',
  FOLLOWER_OF_CREATOR: 'Người theo dõi',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè',
  SELF_ONLY: 'Chỉ mình tôi',
}

export const MAX_CAPTION = 2200

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export const fmtSize = (bytes) => (bytes > 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

export function fmtRelative(iso) {
  const diff = Date.parse(iso) - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  return rtf.format(Math.round(diff / 86_400_000), 'day')
}

// ISO ↔ giá trị cho <input type="datetime-local"> theo giờ máy người dùng
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

export const hashtagsOf = (caption) => caption.match(/#[\p{L}\p{N}_]+/gu) || []

/** Gọi `load` ngay và lặp lại mỗi `intervalMs`; trả về [data, error, reload]. */
export function usePolling(load, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])
  useEffect(() => {
    reload()
    const t = setInterval(reload, intervalMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [data, error, reload]
}
