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

export const api = {
  videos: (params = {}) => request('GET', `/videos?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`),
  video: (id) => request('GET', `/videos/${id}`),
  updateVideo: (id, patch) => request('PATCH', `/videos/${id}`, patch),
  deleteVideo: (id) => request('DELETE', `/videos/${id}`),
  publishNow: (id) => request('POST', `/videos/${id}/publish`),
  bulk: (body) => request('POST', '/videos/bulk', body),
  stats: () => request('GET', '/stats'),
  logs: (params = {}) => request('GET', `/logs?${new URLSearchParams(params)}`),
  settings: () => request('GET', '/settings'),
  saveSettings: (patch) => request('PUT', '/settings', patch),
  login: () => request('POST', '/auth/login'),
  fileUrl: (id) => `/api/videos/${id}/file`,

  // Dùng XHR để có tiến trình upload
  upload(file, fields, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/videos')
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
