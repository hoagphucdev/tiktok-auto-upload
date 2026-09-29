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
  const { openEditor, version } = useApp()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [videos] = usePolling(() => api.videos(), 10_000, [version])

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS))
  const itemsOn = (day) =>
    (videos || [])
      .map((v) => ({ v, at: v.publishedAt || v.scheduledAt }))
      .filter(({ v, at }) => at && v.status !== 'draft' && startOfDay(at).getTime() === day.getTime())
      .sort((a, b) => a.at.localeCompare(b.at))

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
              {items.map(({ v, at }) => (
                <button key={v.id} className={`slot ${v.status}`} onClick={() => openEditor(v.id)}>
                  <time>{new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
                  <span className="clamp-2">{v.title || v.originalName}</span>
                  <StatusBadge status={v.status} />
                </button>
              ))}
            </section>
          )
        })}
      </div>
      <p className="muted small">Lịch hiển thị video đã lên lịch, đang đăng, đã đăng và bị lỗi. Bấm vào một video để sửa hoặc đổi giờ.</p>
    </>
  )
}
