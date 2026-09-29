import { useApp } from '../context.js'
import { fmtDateTime } from '../util.js'

/** Thanh trạng thái dữ liệu kênh: lấy lúc nào, nút làm mới, lỗi/chưa cấu hình. */
export default function ChannelState() {
  const { channel, stats } = useApp()
  const { data, error, loading, reload } = channel

  if (!stats) return null
  if (!stats.auth?.loggedIn) {
    return (
      <div className="callout">
        Chưa đăng nhập TikTok. Vào <a href="#/settings">Cài đặt</a> và bấm <b>Đăng nhập TikTok</b> để tool lấy thông tin kênh và video qua
        API chính thức.
      </div>
    )
  }

  return (
    <div className={`fetch-bar ${error ? 'error' : ''}`}>
      <span>
        {loading && !data && 'Đang lấy dữ liệu từ TikTok API…'}
        {data && (
          <>
            Dữ liệu lấy trực tiếp từ TikTok API lúc <b>{fmtDateTime(data.fetchedAt)}</b>
            {!data.complete && ` · mới lấy ${data.videos.length}${data.user.stats.videos != null ? `/${data.user.stats.videos}` : ''} video (tăng giới hạn trong Cài đặt)`}
          </>
        )}
        {data?.warnings?.map((w) => (
          <span key={w} className="danger-text">
            {' '}
            ⚠ {w}
          </span>
        ))}
        {error && <span className="danger-text"> {error}</span>}
      </span>
      <button onClick={() => reload(true)} disabled={loading}>
        {loading ? 'Đang lấy…' : '↻ Làm mới từ TikTok'}
      </button>
    </div>
  )
}
