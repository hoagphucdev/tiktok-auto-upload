import { api } from '../api.js'
import { useApp } from '../context.js'
import { STATUS_LABEL, engagementRate, fmtCount, fmtDateTime, usePolling } from '../util.js'
import { Empty, LogList, PageHeader, StatusBadge, When } from '../components/common.jsx'
import ChannelState from '../components/ChannelState.jsx'

const QUEUE_CARDS = ['draft', 'scheduled', 'failed']

export default function Dashboard() {
  const { stats, channel, openEditor, openTikTok, run, version } = useApp()
  const [logs] = usePolling(() => api.logDays().then(({ today }) => api.logDay(today, { limit: 12 })), 5000, [version])

  if (!stats) return <p className="muted">Đang tải…</p>
  const data = channel.data
  const videos = data?.videos || []
  const sum = (k) => videos.reduce((t, v) => t + v.stats[k], 0)
  const totals = { views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), saves: sum('saves') }
  const top = [...videos].sort((a, b) => b.stats.views - a.stats.views).slice(0, 5)
  const pct = stats.dailyLimit ? Math.min(100, (stats.publishedToday / stats.dailyLimit) * 100) : 0

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Kênh TikTok và hàng chờ đăng">
        <button
          className={stats.paused ? 'primary' : ''}
          onClick={() => run(() => api.saveSettings({ paused: !stats.paused }), stats.paused ? 'Đã bật tự động đăng' : 'Đã tạm dừng tự động đăng')}
        >
          {stats.paused ? '▶ Bật tự động đăng' : '❚❚ Tạm dừng tự động đăng'}
        </button>
        <a className="button primary" href="#/queue">
          + Tải video lên
        </a>
      </PageHeader>

      <ChannelState />

      {data && (
        <section className="card channel-card">
          {data.user.avatar && <img className="avatar" src={data.user.avatar} alt="" referrerPolicy="no-referrer" />}
          <div className="channel-info">
            <h2>
              {data.user.nickname} {data.user.verified && <span title="Đã xác minh">✔</span>}
            </h2>
            <a href={data.user.url} target="_blank" rel="noreferrer">
              @{data.user.username} ↗
            </a>
            {data.user.bio && <p className="muted">{data.user.bio}</p>}
          </div>
          <div className="channel-stats">
            <Big label="Người theo dõi" value={data.user.stats.followers} />
            <Big label="Đang theo dõi" value={data.user.stats.following} />
            <Big label="Lượt thích" value={data.user.stats.likes} />
            <Big label="Video" value={data.user.stats.videos} />
          </div>
        </section>
      )}

      {data && videos.length > 0 && (
        <section className="stat-grid">
          <Stat label={`Tổng lượt xem (${videos.length} video)`} value={totals.views} />
          <Stat label="Xem trung bình / video" value={Math.round(totals.views / videos.length)} />
          <Stat label="Tổng thích" value={totals.likes} />
          <Stat label="Tổng bình luận" value={totals.comments} />
          <div className="stat">
            <span className="stat-label">Tương tác trung bình</span>
            <span className="stat-value">{engagementRate(totals).toFixed(1)}%</span>
          </div>
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <h2>Video xem nhiều nhất</h2>
          {top.length ? (
            <ul className="rows">
              {top.map((v) => (
                <li key={v.id} onClick={() => openTikTok(v.id)}>
                  <div className="row-with-cover">
                    {v.cover && <img className="cover" src={v.cover} alt="" referrerPolicy="no-referrer" />}
                    <div className="row-main">
                      <span className="clamp-2">{v.caption || 'Không có caption'}</span>
                      <span className="muted small">{fmtDateTime(v.createdAt)}</span>
                    </div>
                  </div>
                  <div className="row-side">
                    <strong>▶ {fmtCount(v.stats.views)}</strong>
                    <span className="muted">♥ {fmtCount(v.stats.likes)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{data ? 'Kênh chưa có video.' : 'Chưa có dữ liệu từ TikTok.'}</Empty>
          )}
          {top.length > 0 && (
            <a href="#/channel" className="small">
              Xem tất cả video trên kênh →
            </a>
          )}
        </section>

        <section className="card">
          <h2>Hàng chờ đăng</h2>
          <div className="mini-stats">
            {QUEUE_CARDS.map((s) => (
              <a key={s} href="#/queue" onClick={() => sessionStorage.setItem('libraryStatus', s)} className={`mini ${s}`}>
                <strong>{stats.counts[s]}</strong> {STATUS_LABEL[s]}
              </a>
            ))}
            <div className="mini">
              <strong>
                {stats.publishedToday}
                {stats.dailyLimit > 0 && `/${stats.dailyLimit}`}
              </strong>{' '}
              đã đăng hôm nay
              {stats.dailyLimit > 0 && (
                <div className="meter">
                  <div style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>
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
              Chưa có video nào được lên lịch. Vào <a href="#/queue">Hàng chờ đăng</a> để lên lịch.
            </Empty>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>
          Nhật ký hôm nay <a href="#/logs" className="small">xem tất cả →</a>
        </h2>
        <LogList logs={logs} />
      </section>
    </>
  )
}

function Big({ label, value }) {
  return (
    <div>
      <strong title={value?.toLocaleString('vi-VN')}>{fmtCount(value)}</strong>
      <span>{label}</span>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" title={value?.toLocaleString('vi-VN')}>
        {fmtCount(value)}
      </span>
    </div>
  )
}
