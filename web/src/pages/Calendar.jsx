import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { usePolling } from '../util.js'
import { PageHeader, StatusBadge } from '../components/common.jsx'

const DAY_MS = 86_400_000
const startOfDay = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d
}
const startOfWeek = (t) => {
  const d = startOfDay(t)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // tuần bắt đầu từ thứ Hai
  return d
}

export default function Calendar() {
  const { openEditor, openTikTok, version, channel } = useApp()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [pending] = usePolling(() => api.pending(), 10_000, [version])

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS))
  // Bài đã đăng lấy từ TikTok; bài sắp đăng lấy từ hàng chờ
  const all = [
    ...(channel.data?.videos || []).map((v) => ({
      key: `tt-${v.id}`,
      at: v.createdAt,
      title: v.caption || '(không caption)',
      status: 'published',
      open: () => openTikTok(v.id),
    })),
    ...(pending || [])
      .filter((v) => v.status !== 'draft' && v.scheduledAt)
      .map((v) => ({ key: v.id, at: v.scheduledAt, title: v.title || v.originalName, status: v.status, open: () => openEditor(v.id) })),
  ]
  const itemsOn = (day) =>
    all.filter((x) => x.at && startOfDay(x.at).getTime() === day.getTime()).sort((a, b) => a.at.localeCompare(b.at))

  const shift = (weeks) => setWeekStart((d) => new Date(d.getTime() + weeks * 7 * DAY_MS))
  const today = startOfDay(Date.now()).getTime()
  const end = days[6]

  return (
    <>
      <PageHeader
        title="Lịch đăng"
        subtitle={`${weekStart.toLocaleDateString('vi-VN')} – ${end.toLocaleDateString('vi-VN')}`}
      >
        <button onClick={() => shift(-1)}>← Tuần trước</button>
        <button onClick={() => setWeekStart(startOfWeek(Date.now()))}>Tuần này</button>
        <button onClick={() => shift(1)}>Tuần sau →</button>
      </PageHeader>

      <div className="week">
        {days.map((day) => {
          const items = itemsOn(day)
          return (
            <section key={day.toISOString()} className={`day ${day.getTime() === today ? 'today' : ''} ${day.getTime() < today ? 'past' : ''}`}>
              <header>
                <span>{day.toLocaleDateString('vi-VN', { weekday: 'short' })}</span>
                <strong>{day.getDate()}</strong>
                {items.length > 0 && <span className="count">{items.length}</span>}
              </header>
              {items.map((x) => (
                <button key={x.key} className={`slot ${x.status}`} onClick={x.open}>
                  <time>{new Date(x.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
                  <span className="clamp-2">{x.title}</span>
                  <StatusBadge status={x.status} />
                </button>
              ))}
            </section>
          )
        })}
      </div>
      <p className="muted small">Video đã đăng lấy từ TikTok; video đã lên lịch / lỗi lấy từ hàng chờ. Bấm vào một mục để xem hoặc sửa.</p>
    </>
  )
}
