async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`)
  return data
}

const qs = (params = {}) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null))

export const api = {
  // Kênh TikTok — luôn lấy từ TikTok (server chỉ giữ tạm vài phút trong RAM)
  channel: (refresh = false) => request('GET', `/channel${refresh ? '?refresh=1' : ''}`),
  channelVideo: (id) => request('GET', `/channel/videos/${id}`),

  // Hàng chờ đăng (video chưa có trên TikTok)
  pending: (params = {}) => request('GET', `/pending?${qs(params)}`),
  pendingItem: (id) => request('GET', `/pending/${id}`),
  updatePending: (id, patch) => request('PATCH', `/pending/${id}`, patch),
  deletePending: (id) => request('DELETE', `/pending/${id}`),
  publishNow: (id) => request('POST', `/pending/${id}/publish`),
  bulk: (body) => request('POST', '/pending/bulk', body),
  pendingFileUrl: (id) => `/api/pending/${id}/file`,

  stats: () => request('GET', '/stats'),

  // Nhật ký .txt theo ngày
  logDays: () => request('GET', '/logs'),
  logDay: (day, params = {}) => request('GET', `/logs/${day}?${qs(params)}`),
  logDownloadUrl: (day) => `/api/logs/${day}/download`,

  settings: () => request('GET', '/settings'),
  saveSettings: (patch) => request('PUT', '/settings', patch),
  login: () => request('POST', '/auth/login'),

  // Dùng XHR để có tiến trình upload
  upload(file, fields, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/pending')
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText || '{}')
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || `Lỗi ${xhr.status}`))
      }
      xhr.onerror = () => reject(new Error('Mất kết nối tới server'))
      xhr.send(form)
    })
  },
}
