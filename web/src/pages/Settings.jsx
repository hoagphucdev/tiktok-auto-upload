import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { PRIVACY_LABEL, fmtDateTime } from '../util.js'
import { PageHeader } from '../components/common.jsx'

export default function Settings() {
  const { run, stats } = useApp()
  const [form, setForm] = useState(null)

  useEffect(() => {
    api.settings().then(setForm)
  }, [])

  if (!form) return <p className="muted">Đang tải…</p>

  const set = (key, parse = (v) => v) => (e) =>
    setForm((f) => ({ ...f, [key]: parse(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }))
  const setSet = (i, key) => (e) =>
    setForm((f) => ({ ...f, hashtagSets: f.hashtagSets.map((s, j) => (j === i ? { ...s, [key]: e.target.value } : s)) }))

  async function save(e) {
    e.preventDefault()
    const saved = await run(() => api.saveSettings(form), 'Đã lưu cài đặt')
    setForm(saved)
  }

  const loggingIn = stats?.busy?.kind === 'login'

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Cách đăng, trình duyệt, nhịp đăng bài và bộ hashtag" />

      <form className="settings" onSubmit={save}>
        <section className="card">
          <h2>Kênh TikTok</h2>
          <div className="grid-2">
            <label>
              Tên kênh (@username)
              <input value={form.username} onChange={set('username')} placeholder="@ten_kenh" required={form.method !== 'api'} />
              <span className="muted small">
                {form.method === 'api'
                  ? 'Chế độ API: dữ liệu lấy qua API chính thức theo tài khoản đã đăng nhập, không cần điền.'
                  : 'Thông tin kênh và video được lấy trực tiếp từ trang này trên TikTok.'}
              </span>
            </label>
            <label>
              Số video tối đa lấy về mỗi lần
              <input type="number" min="1" max="500" value={form.maxVideos} onChange={set('maxVideos', Number)} />
              <span className="muted small">Càng nhiều càng lâu (TikTok tải khoảng 30 video mỗi lần cuộn).</span>
            </label>
          </div>

          <h3>Đăng nhập</h3>
          {form.method === 'browser' ? (
            <>
              <p className="muted">
                Bấm nút dưới, một cửa sổ trình duyệt sẽ mở ra trên máy chạy server. Bạn đăng nhập TikTok trong đó; tool tự nhận biết
                khi đăng nhập xong và đóng cửa sổ.
              </p>
              <div className="actions">
                <button type="button" className="primary" disabled={loggingIn} onClick={() => run(api.login, 'Đã mở trình duyệt, hãy đăng nhập TikTok')}>
                  {loggingIn ? 'Đang chờ bạn đăng nhập…' : 'Đăng nhập TikTok'}
                </button>
                <span className="muted">Lần đăng nhập gần nhất: {fmtDateTime(form.lastLoginAt)}</span>
              </div>
            </>
          ) : (
            <p className="muted">
              Chế độ API: đăng nhập OAuth bằng lệnh <code>node src/cli.mjs login --api</code> trong terminal (cần client key trong{' '}
              <code>.env</code>).
            </p>
          )}
        </section>

        <section className="card">
          <h2>Cách đăng</h2>
          <div className="grid-2">
            <label>
              Phương thức
              <select value={form.method} onChange={set('method')}>
                <option value="browser">Trình duyệt (không cần key)</option>
                <option value="api">Content Posting API (cần key)</option>
              </select>
            </label>
            <label>
              Quyền xem mặc định cho video mới
              <select value={form.privacy} onChange={set('privacy')}>
                {Object.entries(PRIVACY_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {form.method === 'browser' && (
            <>
              <div className="grid-2">
                <label>
                  Trình duyệt tool tự mở
                  <select value={form.browser} onChange={set('browser')}>
                    <option value="chromium">Chromium (do Playwright cài)</option>
                    <option value="brave">Brave</option>
                  </select>
                </label>
                <label>
                  Đường dẫn trình duyệt (tuỳ chọn)
                  <input value={form.chromiumPath} onChange={set('chromiumPath')} placeholder="C:\Program Files\BraveSoftware\...\brave.exe" />
                </label>
              </div>
              <label>
                Mở tab trong trình duyệt đang chạy (CDP URL, tuỳ chọn)
                <input value={form.cdpUrl} onChange={set('cdpUrl')} placeholder="http://127.0.0.1:9222" />
                <span className="muted small">
                  Điền nếu bạn mở Brave với <code>--remote-debugging-port=9222</code>; tool sẽ mở tab mới trong cửa sổ đó thay vì mở trình
                  duyệt riêng. Để trống để tool tự mở trình duyệt.
                </span>
              </label>
              <label className="check">
                <input type="checkbox" checked={form.headless} onChange={set('headless')} />
                Chạy ẩn trình duyệt (không khuyến nghị — TikTok hay chặn)
              </label>
            </>
          )}
        </section>

        <section className="card">
          <h2>Nhịp đăng tự động</h2>
          <div className="grid-2">
            <label>
              Khoảng cách tối thiểu giữa 2 bài (phút)
              <input type="number" min="0" value={form.gapMinutes} onChange={set('gapMinutes', Number)} />
            </label>
            <label>
              Tối đa số bài mỗi ngày (0 = không giới hạn)
              <input type="number" min="0" value={form.dailyLimit} onChange={set('dailyLimit', Number)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.paused} onChange={set('paused')} />
            Tạm dừng tự động đăng (nút "Đăng ngay" vẫn hoạt động)
          </label>
          <p className="muted small">"Đăng ngay" bỏ qua khoảng cách và giới hạn/ngày. Nên để khoảng cách ≥ 60 phút để tránh bị TikTok hạn chế.</p>
        </section>

        <section className="card">
          <h2>Bộ hashtag</h2>
          <p className="muted">Lưu sẵn các nhóm hashtag hay dùng để chèn nhanh khi soạn caption.</p>
          {form.hashtagSets.map((s, i) => (
            <div key={i} className="hashtag-row">
              <input placeholder="Tên (vd: Robot)" value={s.name} onChange={setSet(i, 'name')} />
              <input placeholder="#robot #gipsydanger #fyp" value={s.tags} onChange={setSet(i, 'tags')} />
              <button
                type="button"
                className="ghost icon"
                aria-label="Xoá bộ hashtag"
                onClick={() => setForm((f) => ({ ...f, hashtagSets: f.hashtagSets.filter((_, j) => j !== i) }))}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setForm((f) => ({ ...f, hashtagSets: [...f.hashtagSets, { name: '', tags: '' }] }))}>
            + Thêm bộ hashtag
          </button>
        </section>

        <div className="sticky-save">
          <button className="primary">Lưu cài đặt</button>
        </div>
      </form>
    </>
  )
}
