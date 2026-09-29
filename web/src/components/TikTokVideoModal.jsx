import { useEffect } from 'react'
import { useApp } from '../context.js'
import { engagementRate, fmtCount, fmtDateTime, fmtDuration } from '../util.js'

/** Chi tiết 1 video trên kênh: nhúng player TikTok (iframe) + đầy đủ thông tin lấy từ TikTok. */
export default function TikTokVideoModal({ id, onClose }) {
  const { channel } = useApp()
  const video = channel.data?.videos.find((v) => v.id === id)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  if (!video) return null
  const s = video.stats

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal editor" onClick={(e) => e.stopPropagation()}>
        <div className="editor-preview">
          {video.private ? (
            <div className="embed-placeholder">
              {video.cover && <img src={video.cover} alt="" referrerPolicy="no-referrer" />}
              <p>Video riêng tư — TikTok không cho nhúng. Mở trên TikTok để xem.</p>
            </div>
          ) : (
            <iframe
              className="tiktok-embed"
              src={video.embedUrl}
              title={video.caption || video.id}
              allow="encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
            />
          )}
          <a className="button primary block" href={video.url} target="_blank" rel="noreferrer">
            Mở trên TikTok ↗
          </a>
        </div>

        <div className="editor-form">
          <div className="editor-head">
            <h2>Video trên kênh</h2>
            <button type="button" className="ghost icon" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>

          <div className="chips">
            {video.pinned && <span className="badge scheduled">Đã ghim</span>}
            {video.private ? <span className="badge draft">Riêng tư</span> : <span className="badge published">Công khai</span>}
            {video.isAd && <span className="badge publishing">Quảng cáo</span>}
          </div>

          <p className="caption-full">{video.caption || <span className="muted">Không có caption</span>}</p>

          <div className="metric-grid">
            <Metric label="Lượt xem" value={s.views} />
            <Metric label="Thích" value={s.likes} />
            <Metric label="Bình luận" value={s.comments} />
            <Metric label="Chia sẻ" value={s.shares} />
            <Metric label="Lưu" value={s.saves} />
            <div className="metric">
              <span>Tương tác</span>
              <strong>{engagementRate(s).toFixed(1)}%</strong>
            </div>
          </div>

          <dl className="facts">
            <dt>Đăng lúc</dt>
            <dd>{fmtDateTime(video.createdAt)}</dd>
            <dt>Thời lượng</dt>
            <dd>{fmtDuration(video.duration)}</dd>
            <dt>Kích thước</dt>
            <dd>{video.width && video.height ? `${video.width}×${video.height}` : '—'}</dd>
            <dt>Hashtag</dt>
            <dd>{video.hashtags.length ? video.hashtags.map((h) => `#${h}`).join(' ') : '—'}</dd>
            <dt>Âm thanh</dt>
            <dd>{video.music || '—'}</dd>
            <dt>ID</dt>
            <dd>
              <code>{video.id}</code>
            </dd>
            <dt>Link</dt>
            <dd>
              <a href={video.url} target="_blank" rel="noreferrer" className="break">
                {video.url}
              </a>
            </dd>
          </dl>
          <p className="muted small">
            Số liệu lấy trực tiếp từ TikTok lúc {fmtDateTime(channel.data.fetchedAt)}. Bấm "Làm mới từ TikTok" để cập nhật.
          </p>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong title={value?.toLocaleString('vi-VN')}>{fmtCount(value)}</strong>
    </div>
  )
}
