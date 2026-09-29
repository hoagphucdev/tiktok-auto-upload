import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { MAX_CAPTION, PRIVACY_LABEL, fmtDateTime, fmtSize, fromLocalInput, hashtagsOf, toLocalInput, usePolling } from '../util.js'
import { LogList, StatusBadge } from './common.jsx'

export default function VideoEditor({ id, onClose }) {
  const { run, version } = useApp()
  const [video, setVideo] = useState(null)
  const [form, setForm] = useState(null)
  const [settings, setSettings] = useState(null)
  // Lịch sử của video này trong nhật ký .txt hôm nay
  const [logs] = usePolling(
    () => api.logDays().then(({ today }) => api.logDay(today)).then((entries) => entries.filter((e) => e.target.includes(id))),
    5000,
    [id, version],
  )
  const captionRef = useRef(null)

  useEffect(() => {
    api.pendingItem(id).then((v) => {
      setVideo(v)
      setForm({
        title: v.title,
        caption: v.caption,
        privacy: v.privacy,
        tags: v.tags.join(', '),
        notes: v.notes,
        scheduledAt: toLocalInput(v.scheduledAt),
      })
    })
    api.settings().then(setSettings)
  }, [id])

  // Esc để đóng
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  if (!video || !form) return null

  const locked = video.status === 'publishing'
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const payload = (extra = {}) => ({
    title: form.title,
    caption: form.caption,
    privacy: form.privacy,
    tags: form.tags,
    notes: form.notes,
    scheduledAt: fromLocalInput(form.scheduledAt),
    ...extra,
  })

  function insertTags(tags) {
    const el = captionRef.current
    const pos = el?.selectionEnd ?? form.caption.length
    const before = form.caption.slice(0, pos)
    const sep = before && !/\s$/.test(before) ? ' ' : ''
    setForm((f) => ({ ...f, caption: `${before}${sep}${tags}${f.caption.slice(pos)}` }))
  }

  const save = (extra, message) => run(() => api.updatePending(id, payload(extra)), message).then(onClose)

  async function publishNow() {
    await run(() => api.updatePending(id, payload()))
    await run(() => api.publishNow(id), 'Đã đưa vào hàng đợi đăng ngay')
    onClose()
  }

  async function remove() {
    if (!confirm('Xoá video này khỏi hàng chờ?')) return
    await run(() => api.deletePending(id), 'Đã xoá khỏi hàng chờ')
    onClose()
  }

  const tags = hashtagsOf(form.caption)
  const scheduleInPast = form.scheduledAt && Date.parse(fromLocalInput(form.scheduledAt)) < Date.now()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal editor" onClick={(e) => e.stopPropagation()}>
        <div className="editor-preview">
          <video src={api.pendingFileUrl(id)} controls playsInline />
          <dl className="facts">
            <dt>Trạng thái</dt>
            <dd>
              <StatusBadge status={video.status} />
            </dd>
            <dt>File</dt>
            <dd className="clamp-1" title={video.originalName}>
              {video.originalName} · {fmtSize(video.size)}
            </dd>
            <dt>Tải lên</dt>
            <dd>{fmtDateTime(video.createdAt)}</dd>
            {video.attempts > 0 && (
              <>
                <dt>Số lần đăng</dt>
                <dd>{video.attempts}</dd>
              </>
            )}
          </dl>
          {video.lastError && <div className="callout danger">{video.lastError}</div>}
          <h3>Lịch sử hôm nay</h3>
          <LogList logs={logs} />
        </div>

        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault()
            save({}, 'Đã lưu')
          }}
        >
          <div className="editor-head">
            <h2>Video trong hàng chờ</h2>
            <button type="button" className="ghost icon" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>

          {locked && <div className="callout">Video đang được đăng, tạm thời không sửa được.</div>}

          <fieldset disabled={locked}>
            <label>
              Tiêu đề (chỉ dùng trong tool)
              <input value={form.title} onChange={set('title')} maxLength={200} />
            </label>

            <label>
              <span className="label-row">
                Caption
                <span className={form.caption.length > MAX_CAPTION ? 'danger-text' : 'muted'}>
                  {form.caption.length}/{MAX_CAPTION}
                </span>
              </span>
              <textarea ref={captionRef} rows={7} value={form.caption} onChange={set('caption')} placeholder="Nội dung + #hashtag" />
            </label>
            {tags.length > 0 && (
              <div className="chips">
                {tags.map((t, i) => (
                  <span key={i} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {settings?.hashtagSets?.length > 0 && (
              <div className="chips">
                <span className="muted">Chèn nhanh:</span>
                {settings.hashtagSets.map((s) => (
                  <button type="button" key={s.name} className="chip button-chip" onClick={() => insertTags(s.tags)} title={s.tags}>
                    + {s.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid-2">
              <label>
                Ai được xem
                <select value={form.privacy} onChange={set('privacy')}>
                  {Object.entries(PRIVACY_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hẹn giờ đăng
                <input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} />
              </label>
            </div>
            {scheduleInPast && <p className="muted small">Giờ hẹn đã qua, video sẽ được đăng ở lượt kiểm tra kế tiếp.</p>}

            <label>
              Tag nội bộ (phân loại, cách nhau bởi dấu phẩy)
              <input value={form.tags} onChange={set('tags')} placeholder="series robot, review, trend…" />
            </label>

            <label>
              Ghi chú
              <textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Ý tưởng, nhạc nền, người phụ trách…" />
            </label>
          </fieldset>

          <div className="modal-actions spread">
            <button type="button" className="danger ghost" onClick={remove} disabled={locked}>
              Xoá
            </button>
            <div className="actions">
              {video.status === 'scheduled' && (
                <button type="button" onClick={() => save({ status: 'draft' }, 'Đã huỷ lịch, chuyển về nháp')} disabled={locked}>
                  Huỷ lịch
                </button>
              )}
              <button type="submit" disabled={locked}>
                Lưu
              </button>
              <button
                type="button"
                disabled={locked || !form.scheduledAt}
                title={form.scheduledAt ? '' : 'Chọn giờ hẹn trước'}
                onClick={() => save({ status: 'scheduled' }, 'Đã lên lịch')}
              >
                Lên lịch
              </button>
              <button type="button" className="primary" disabled={locked} onClick={publishNow}>
                {video.status === 'failed' ? 'Thử lại ngay' : 'Đăng ngay'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
