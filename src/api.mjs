const API = 'https://open.tiktokapis.com/v2'

export class TikTokApiError extends Error {
  constructor(error, status) {
    super(`TikTok API ${status} ${error?.code}: ${error?.message || 'unknown error'} (log_id: ${error?.log_id})`)
    this.code = error?.code
    this.status = status
  }
}

async function post(path, token, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.error && json.error.code !== 'ok')) throw new TikTokApiError(json.error, res.status)
  return json.data
}

export const queryCreatorInfo = (token) => post('/post/publish/creator_info/query/', token)

export const initDirectPost = (token, postInfo, sourceInfo) =>
  post('/post/publish/video/init/', token, { post_info: postInfo, source_info: sourceInfo })

export const initInboxUpload = (token, sourceInfo) =>
  post('/post/publish/inbox/video/init/', token, { source_info: sourceInfo })

export const fetchPublishStatus = (token, publishId) =>
  post('/post/publish/status/fetch/', token, { publish_id: publishId })
