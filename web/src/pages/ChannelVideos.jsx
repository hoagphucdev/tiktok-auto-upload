import { useMemo, useState } from 'react'
import { useApp } from '../context.js'
import { engagementRate, fmtCount, fmtDateTime, fmtDuration } from '../util.js'
import { Empty, PageHeader } from '../components/common.jsx'
import ChannelState from '../components/ChannelState.jsx'

const SORTS = {
  createdAt: { label: 'Mới nhất', get: (v) => v.createdAt || '' },
  views: { label: 'Lượt xem', get: (v) => v.stats.views },
  likes: { label: 'Thích', get: (v) => v.stats.likes },
  comments: { label: 'Bình luận', get: (v) => v.stats.comments },
  shares: { label: 'Chia sẻ', get: (v) => v.stats.shares },
  saves: { label: 'Lưu', get: (v) => v.stats.saves },
  engagement: { label: 'Tương tác', get: (v) => engagementRate(v.stats) },
}
const VISIBILITY = { '': 'Tất cả', public: 'Công khai', private: 'Riêng tư' }

export default function ChannelVideos() {
  const { channel, openTikTok } = useApp()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('createdAt')
  const [visibility, setVisibility] = useState('')
  const [view, setView] = useState(() => localStorage.getItem('channelView') || 'table')

  const videos = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const get = SORTS[sort].get
    return (channel.data?.videos || [])
      .filter((v) => !visibility || (visibility === 'private') === v.private)
      .filter((v) => !needle || `${v.caption} ${v.hashtags.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => (get(b) > get(a) ? 1 : get(b) < get(a) ? -1 : 0))
  }, [channel.data, q, sort, visibility])

  const switchView = (v) => {
    setView(v)
    localStorage.setItem('channelView', v)
  }

  return (
    <>
      <PageHeader title="Video trên kênh" subtitle="Toàn bộ thông tin lấy trực tiếp từ TikTok, không lưu trên máy" />
      <ChannelState />

      {channel.data && (
        <>
          <div className="toolbar">
            <div className="tabs">
              {Object.entries(VISIBILITY).map(([k, label]) => (
                <button key={k} className={visibility === k ? 'active' : ''} onClick={() => setVisibility(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="actions">
              <input className="search" placeholder="Tìm caption, hashtag…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp">
                {Object.entries(SORTS).map(([k, s]) => (
                  <option key={k} value={k}>
                    Sắp xếp: {s.label}
                  </option>
                ))}
              </select>
              <div className="segmented">
                <button className={view === 'table' ? 'active' : ''} onClick={() => switchView('table')}>
                  Bảng
                </button>
                <button className={view === 'grid' ? 'active' : ''} onClick={() => switchView('grid')}>
                  Lưới
                </button>
              </div>
            </div>
          </div>

          {!videos.length ? (
            <Empty>{channel.data.videos.length ? 'Không có video nào khớp bộ lọc.' : 'Kênh chưa có video nào.'}</Empty>
          ) : view === 'table' ? (
            <div className="card table-wrap">
              <table className="video-table">
                <thead>
                  <tr>
                    <th>Video</th>
                    <th>Đăng lúc</th>
                    <th className="num">Thời lượng</th>
                    <th className="num">Xem</th>
                    <th className="num">Thích</th>
                    <th className="num">B.luận</th>
                    <th className="num">Chia sẻ</th>
                    <th className="num">Lưu</th>
                    <th className="num">Tương tác</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {videos.map((v) => (
                    <tr key={v.id} onClick={() => openTikTok(v.id)} className="clickable">
                      <td>
                        <div className="video-cell">
                          <Cover video={v} />
                          <div>
                            <span className="clamp-2">{v.caption || <span className="muted">Không có caption</span>}</span>
                            <div className="chips tight">
                              {v.pinned && <span className="badge scheduled">Ghim</span>}
                              {v.private && <span className="badge draft">Riêng tư</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">{fmtDateTime(v.createdAt)}</td>
                      <td className="num">{fmtDuration(v.duration)}</td>
                      <td className="num strong">{fmtCount(v.stats.views)}</td>
                      <td className="num">{fmtCount(v.stats.likes)}</td>
                      <td className="num">{fmtCount(v.stats.comments)}</td>
                      <td className="num">{fmtCount(v.stats.shares)}</td>
                      <td className="num">{fmtCount(v.stats.saves)}</td>
                      <td className="num">{engagementRate(v.stats).toFixed(1)}%</td>
                      <td>
                        <a href={v.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Mở trên TikTok">
                          ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((v) => (
                <article key={v.id} className="video-card" onClick={() => openTikTok(v.id)}>
                  <div className="thumb">
                    <Cover video={v} fill />
                    {v.private && <span className="badge draft">Riêng tư</span>}
                    <span className="duration">{fmtDuration(v.duration)}</span>
                  </div>
                  <div className="card-body">
                    <p className="clamp-2">{v.caption || <span className="muted">Không có caption</span>}</p>
                    <div className="meta">
                      <span>▶ {fmtCount(v.stats.views)}</span>
                      <span>♥ {fmtCount(v.stats.likes)}</span>
                      <span>💬 {fmtCount(v.stats.comments)}</span>
                    </div>
                    <div className="meta">{fmtDateTime(v.createdAt)}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function Cover({ video, fill }) {
  return video.cover ? (
    <img className={fill ? 'cover fill' : 'cover'} src={video.cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className={fill ? 'cover fill' : 'cover'} />
  )
}
