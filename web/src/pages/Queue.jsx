import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { PRIVACY_LABEL, STATUS_LABEL, fmtSize, fromLocalInput, toLocalInput, usePolling } from '../util.js'
import { Empty, PageHeader, StatusBadge, When } from '../components/common.jsx'
import UploadZone from '../components/UploadZone.jsx'

const FILTERS = ['', 'draft', 'scheduled', 'publishing', 'failed']

function readInitialStatus() {
  const s = sessionStorage.getItem('libraryStatus') || ''
  sessionStorage.removeItem('libraryStatus')
  return s
}

export default function Queue() {
  const { openEditor, run, version, stats } = useApp()
  const [status, setStatus] = useState(readInitialStatus)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [videos] = usePolling(() => api.pending({ status, q }), 5000, [status, q, version])

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  // Thứ tự đăng khi lên lịch hàng loạt: video tải lên trước sẽ đăng trước
  const ids = (videos || []).filter((v) => selected.has(v.id)).map((v) => v.id).reverse()
  const allSelected = videos?.length > 0 && ids.length === videos.length

  async function bulk(action, extra = {}) {
    if (action === 'delete' && !confirm(`Xoá ${ids.length} video khỏi hàng chờ? (File video trên máy cũ bị xoá)`)) return
    await run(() => api.bulk({ ids, action, ...extra }), 'Đã cập nhật')
    setSelected(new Set())
    setBulkOpen(false)
  }

  return (
    <>
      <PageHeader title="Hàng chờ đăng" subtitle="Video chưa có trên TikTok: tải lên, soạn caption, lên lịch. Đăng xong video tự rời hàng chờ và hiện ở mục Video trên kênh." />

      <UploadZone />

      <div className="toolbar">
        <div className="tabs">
          {FILTERS.map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {s ? STATUS_LABEL[s] : 'Tất cả'}
              {s && stats?.counts[s] > 0 && <span className="count">{stats.counts[s]}</span>}
            </button>
          ))}
        </div>
        <input className="search" placeholder="Tìm theo tiêu đề, caption, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {ids.length > 0 && (
        <div className="bulk-bar">
          <span>Đã chọn {ids.length} video</span>
          <button className="primary" onClick={() => setBulkOpen(true)}>
            Lên lịch hàng loạt
          </button>
          <button onClick={() => bulk('draft')}>Chuyển về nháp</button>
          <button className="danger" onClick={() => bulk('delete')}>
            Xoá
          </button>
          <button className="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {!videos ? (
        <p className="muted">Đang tải…</p>
      ) : videos.length === 0 ? (
        <Empty>{q || status ? 'Không có video nào khớp bộ lọc.' : 'Hàng chờ trống. Kéo thả video vào ô phía trên để bắt đầu.'}</Empty>
      ) : (
        <>
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(videos.map((v) => v.id)))}
            />
            Chọn tất cả ({videos.length})
          </label>
          <div className="video-grid">
            {videos.map((v) => (
              <article key={v.id} className={`video-card ${selected.has(v.id) ? 'selected' : ''}`}>
                <div className="thumb" onClick={() => openEditor(v.id)}>
                  <video src={`${api.pendingFileUrl(v.id)}#t=0.5`} preload="metadata" muted playsInline />
                  <StatusBadge status={v.status} />
                  <input
                    type="checkbox"
                    className="card-check"
                    checked={selected.has(v.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(v.id)}
                  />
                </div>
                <div className="card-body" onClick={() => openEditor(v.id)}>
                  <strong className="clamp-1">{v.title || v.originalName}</strong>
                  <p className="clamp-2 muted">{v.caption || 'Chưa có caption'}</p>
                  <div className="meta">
                    <span>{PRIVACY_LABEL[v.privacy]}</span>
                    <span>{fmtSize(v.size)}</span>
                  </div>
                  {v.status === 'scheduled' && (
                    <div className="meta">
                      ⏰ <When iso={v.scheduledAt} />
                    </div>
                  )}
                  {v.status === 'failed' && <p className="danger-text clamp-2">{v.lastError}</p>}
                </div>
                <div className="card-actions">
                  <button onClick={() => openEditor(v.id)}>Sửa</button>
                  {v.status !== 'publishing' && (
                    <button className="primary" onClick={() => run(() => api.publishNow(v.id), 'Đã đưa vào hàng đợi đăng ngay')}>
                      {v.status === 'failed' ? 'Thử lại' : 'Đăng ngay'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {bulkOpen && <BulkScheduleDialog count={ids.length} onClose={() => setBulkOpen(false)} onSubmit={(p) => bulk('schedule', p)} />}
    </>
  )
}

function BulkScheduleDialog({ count, onClose, onSubmit }) {
  // Gợi ý: đầu giờ kế tiếp, cách hiện tại ít nhất 30 phút (setMinutes(60) làm tròn lên)
  const next = new Date(Date.now() + 30 * 60_000)
  if (next.getMinutes() || next.getSeconds()) next.setMinutes(60, 0, 0)
  const [start, setStart] = useState(toLocalInput(next.toISOString()))
  const [gap, setGap] = useState(120)
  const end = new Date(Date.parse(fromLocalInput(start)) + (count - 1) * gap * 60_000)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal small"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({ startAt: fromLocalInput(start), intervalMinutes: Number(gap) })
        }}
      >
        <h2>Lên lịch {count} video</h2>
        <p className="muted">Video tải lên trước sẽ được đăng trước.</p>
        <label>
          Bắt đầu lúc
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          Mỗi video cách nhau (phút)
          <input type="number" min="0" value={gap} onChange={(e) => setGap(e.target.value)} required />
        </label>
        {start && <p className="muted">Video cuối sẽ đăng khoảng {end.toLocaleString('vi-VN')}.</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="primary">Lên lịch</button>
        </div>
      </form>
    </div>
  )
}
