import { api } from '../api.js'
import { useApp } from '../context.js'
import { STATUS_LABEL, usePolling } from '../util.js'
import { Empty, LogList, PageHeader, StatusBadge, When } from '../components/common.jsx'

const CARDS = ['draft', 'scheduled', 'published', 'failed']

export default function Dashboard() {
  const { stats, openEditor, run, version } = useApp()
  const [logs] = usePolling(() => api.logs({ limit: 12 }), 5000, [version])

  if (!stats) return <p className="muted">Đang tải…</p>
  const pct = stats.dailyLimit ? Math.min(100, (stats.publishedToday / stats.dailyLimit) * 100) : 0

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Tình hình nội dung của kênh">
        <button
          className={stats.paused ? 'primary' : ''}
          onClick={() =>
            run(() => api.saveSettings({ paused: !stats.paused }), stats.paused ? 'Đã bật tự động đăng' : 'Đã tạm dừng tự động đăng')
          }
        >
          {stats.paused ? '▶ Bật tự động đăng' : '❚❚ Tạm dừng tự động đăng'}
        </button>
        <a className="button primary" href="#/library">
          + Tải video lên
        </a>
      </PageHeader>

      {!stats.lastLoginAt && stats.method === 'browser' && (
        <div className="callout">
          Bạn chưa đăng nhập TikTok trong tool. Vào <a href="#/settings">Cài đặt</a> và bấm <b>Đăng nhập TikTok</b> trước khi
          đăng video. Nếu bạn dùng tab Brave đang mở sẵn và đã đăng nhập ở đó, có thể bỏ qua bước này.
        </div>
      )}

      <section className="stat-grid">
        {CARDS.map((s) => (
          <a key={s} className={`stat ${s}`} href={`#/library`} onClick={() => sessionStorage.setItem('libraryStatus', s)}>
            <span className="stat-label">{STATUS_LABEL[s]}</span>
            <span className="stat-value">{stats.counts[s]}</span>
          </a>
        ))}
        <div className="stat">
          <span className="stat-label">Hôm nay đã đăng</span>
          <span className="stat-value">
            {stats.publishedToday}
            {stats.dailyLimit > 0 && <small> / {stats.dailyLimit}</small>}
          </span>
          {stats.dailyLimit > 0 && (
            <div className="meter">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Sắp đăng</h2>
          {stats.upcoming.length ? (
            <ul className="rows">
              {stats.upcoming.map((v) => (
                <li key={v.id} onClick={() => openEditor(v.id)}>
                  <div className="row-main">
                    <strong>{v.title || v.originalName}</strong>
                    <span className="muted clamp-1">{v.caption || 'Chưa có caption'}</span>
                  </div>
                  <div className="row-side">
                    <When iso={v.scheduledAt} />
                    <StatusBadge status={v.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              Chưa có video nào được lên lịch. Vào <a href="#/library">Thư viện</a> để lên lịch.
            </Empty>
          )}
        </section>

        <section className="card">
          <h2>Hoạt động gần đây</h2>
          <LogList logs={logs} />
        </section>
      </div>
    </>
  )
}
