import { useCallback, useEffect, useState } from 'react'
import { AppContext } from './context.js'
import { api } from './api.js'
import { usePolling } from './util.js'
import Dashboard from './pages/Dashboard.jsx'
import ChannelVideos from './pages/ChannelVideos.jsx'
import Queue from './pages/Queue.jsx'
import Calendar from './pages/Calendar.jsx'
import Logs from './pages/Logs.jsx'
import Settings from './pages/Settings.jsx'
import VideoEditor from './components/VideoEditor.jsx'
import TikTokVideoModal from './components/TikTokVideoModal.jsx'

const PAGES = [
  { id: 'dashboard', label: 'Tổng quan', icon: '◧', Component: Dashboard },
  { id: 'channel', label: 'Video trên kênh', icon: '▶', Component: ChannelVideos },
  { id: 'queue', label: 'Hàng chờ đăng', icon: '▦', Component: Queue },
  { id: 'calendar', label: 'Lịch đăng', icon: '◷', Component: Calendar },
  { id: 'logs', label: 'Nhật ký', icon: '☰', Component: Logs },
  { id: 'settings', label: 'Cài đặt', icon: '⚙', Component: Settings },
]

function useHashRoute() {
  const read = () => location.hash.replace('#/', '') || 'dashboard'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return route
}

/** Dữ liệu kênh lấy từ TikTok qua server; chỉ tải lại khi người dùng bấm "Làm mới" hoặc đổi kênh. */
function useChannel(stats) {
  // Chế độ API không cần tên kênh; chế độ trình duyệt thì cần
  const key = stats && (stats.method === 'api' || stats.username) ? `${stats.method}:${stats.username}` : ''
  const [state, setState] = useState({ data: null, error: null, loading: false })
  const load = useCallback(async (refresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.channel(refresh)
      setState({ data, error: null, loading: false })
    } catch (err) {
      setState((s) => ({ ...s, error: err.message, loading: false }))
    }
  }, [])
  useEffect(() => {
    if (key) load()
    else setState({ data: null, error: null, loading: false })
  }, [key, load])
  return { ...state, reload: load }
}

export default function App() {
  const route = useHashRoute()
  const [editingId, setEditingId] = useState(null)
  const [tiktokId, setTiktokId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [version, setVersion] = useState(0)
  const [stats, , reloadStats] = usePolling(api.stats, 5000)
  const channel = useChannel(stats)

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  // Gọi sau mỗi thay đổi để các trang tải lại dữ liệu
  const refresh = useCallback(() => {
    setVersion((v) => v + 1)
    reloadStats()
  }, [reloadStats])

  const run = useCallback(
    async (fn, success) => {
      try {
        const result = await fn()
        if (success) toast(success, 'success')
        refresh()
        return result
      } catch (err) {
        toast(err.message, 'error')
        throw err
      }
    },
    [toast, refresh],
  )

  const page = PAGES.find((p) => p.id === route) || PAGES[0]
  const busy = stats?.busy

  return (
    <AppContext.Provider
      value={{ toast, refresh, run, version, stats, channel, openEditor: setEditingId, openTikTok: setTiktokId }}
    >
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            {channel.data?.user.avatar ? (
              <img className="brand-mark" src={channel.data.user.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="brand-mark" />
            )}
            <div>
              <strong>TikTok Manager</strong>
              <small>{channel.data?.user.username ? `@${channel.data.user.username}` : stats?.username ? `@${stats.username}` : channel.data?.user.nickname || 'Chưa chọn kênh'}</small>
            </div>
          </div>
          <nav>
            {PAGES.map((p) => (
              <a key={p.id} href={`#/${p.id}`} className={p.id === page.id ? 'active' : ''}>
                <span className="nav-icon">{p.icon}</span>
                {p.label}
                {p.id === 'queue' && stats?.counts.failed > 0 && <span className="pill danger">{stats.counts.failed}</span>}
              </a>
            ))}
          </nav>
          <div className="sidebar-status">
            {busy ? <span className="dot pulse" /> : <span className={`dot ${stats?.paused ? 'off' : 'on'}`} />}
            <span>
              {busy?.kind === 'publish' && 'Đang đăng video…'}
              {busy?.kind === 'login' && 'Đang chờ đăng nhập…'}
              {busy?.kind === 'fetch' && 'Đang lấy dữ liệu từ TikTok…'}
              {!busy && (stats?.paused ? 'Tự động đăng: tạm dừng' : 'Tự động đăng: đang bật')}
            </span>
          </div>
        </aside>

        <main className="content">
          <page.Component />
        </main>
      </div>

      {editingId && <VideoEditor id={editingId} onClose={() => setEditingId(null)} />}
      {tiktokId && <TikTokVideoModal id={tiktokId} onClose={() => setTiktokId(null)} />}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  )
}
