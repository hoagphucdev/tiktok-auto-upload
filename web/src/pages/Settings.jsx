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

  const auth = stats?.auth

  // Mở tab trước (tránh bị chặn popup), rồi trỏ tới link cấp quyền server trả về
  async function login() {
    const tab = window.open('about:blank', '_blank')
    try {
      const { url } = await run(api.login, 'Đã mở trang cấp quyền TikTok ở tab mới')
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch {
      tab?.close()
    }
  }

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Tài khoản TikTok, nhịp đăng bài và bộ hashtag" />

      <form className="settings" onSubmit={save}>
        <section className="card">
          <h2>Tài khoản TikTok</h2>
          {auth?.loggedIn ? (
            <>
              <p>
                Đã đăng nhập <span className="muted">(open_id {auth.openId})</span>. Token tự làm mới, hết hạn hẳn vào{' '}
                <b>{fmtDateTime(auth.refreshExpiresAt)}</b>.
              </p>
              <div className="chips">
                {auth.scopes.map((sc) => (
                  <span key={sc} className="chip">
                    {sc}
                  </span>
                ))}
              </div>
              {!auth.canDirectPost && (
                <div className="callout">
                  Token chưa có quyền <code>video.publish</code> (Direct Post) nên video sẽ được <b>gửi vào hộp nháp</b> trong app
                  TikTok — bạn mở app, soạn caption và bấm Đăng. Bật Direct Post cho app trên developers.tiktok.com rồi đăng nhập lại để
                  đăng thẳng.
                </div>
              )}
            </>
          ) : (
            <p className="muted">Chưa đăng nhập. Cần client key/secret và Redirect URI trong file <code>.env</code> của server.</p>
          )}
          <div className="actions">
            <button type="button" className={auth?.loggedIn ? '' : 'primary'} onClick={login} disabled={auth?.pending}>
              {auth?.pending ? 'Đang chờ bạn cấp quyền…' : auth?.loggedIn ? 'Đăng nhập lại / cấp thêm quyền' : 'Đăng nhập TikTok'}
            </button>
          </div>
          <p className="muted small">
            Trang cấp quyền của TikTok mở ở tab mới; sau khi bấm cho phép, callback (Worker hoặc localhost) trả mã về và server tự lưu
            token.
          </p>
        </section>

        <section className="card">
          <h2>Đăng bài & dữ liệu kênh</h2>
          <div className="grid-2">
            <label>
              Quyền xem mặc định cho video mới
              <select value={form.privacy} onChange={set('privacy')}>
                {Object.entries(PRIVACY_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="muted small">App chưa được TikTok duyệt chỉ đăng được ở chế độ "Chỉ mình tôi".</span>
            </label>
            <label>
              Số video tối đa lấy về mỗi lần
              <input type="number" min="1" max="500" value={form.maxVideos} onChange={set('maxVideos', Number)} />
              <span className="muted small">Display API trả 20 video mỗi lần gọi.</span>
            </label>
          </div>
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
