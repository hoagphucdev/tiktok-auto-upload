import { useApp } from '../context.js'
import { fmtDateTime } from '../util.js'

/** Thanh trạng thái dữ liệu kênh: lấy lúc nào, nút làm mới, lỗi/chưa cấu hình. */
export default function ChannelState() {
  const { channel, stats } = useApp()
  const { data, error, loading, reload } = channel

  if (!stats) return null
  if (!stats.username && stats.method !== 'api') {
    return (
      <div className="callout">
        Chưa đặt tên kênh TikTok. Vào <a href="#/settings">Cài đặt</a>, điền <b>@username</b> của kênh để tool lấy thông tin và video trực
        tiếp từ TikTok.
      </div>
    )
  }

  return (
    <div className={`fetch-bar ${error ? 'error' : ''}`}>
      <span>
        {loading && !data && (stats.method === 'api' ? 'Đang lấy dữ liệu từ TikTok API…' : 'Đang lấy dữ liệu từ TikTok… (mở trình duyệt, có thể mất 10–60 giây)')}
        {data && (
          <>
            Dữ liệu lấy trực tiếp từ TikTok{data.source === 'api' ? ' (API chính thức)' : ''} lúc <b>{fmtDateTime(data.fetchedAt)}</b>
            {data.stale && ' (bản cũ — trình duyệt đang bận)'}
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
