import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { usePolling } from '../util.js'
import { Empty, PageHeader } from '../components/common.jsx'

const LEVELS = { '': 'Tất cả', success: 'Thành công', error: 'Lỗi', warn: 'Cảnh báo', info: 'Thông tin' }
const ACTORS = { '': 'Mọi nguồn', web: 'Người dùng (web)', scheduler: 'Tự động đăng', cli: 'CLI', system: 'Hệ thống' }
const ACTIONS = {
  upload: 'Tải lên',
  edit: 'Sửa',
  delete: 'Xoá',
  schedule: 'Lên lịch',
  publish: 'Đăng',
  refresh: 'Làm mới',
  fetch: 'Lấy dữ liệu',
  settings: 'Cài đặt',
  login: 'Đăng nhập',
  wait: 'Chờ',
  start: 'Khởi động',
}

export default function Logs() {
  const { version } = useApp()
  const [days, setDays] = useState(null)
  const [day, setDay] = useState('')
  const [level, setLevel] = useState('')
  const [actor, setActor] = useState('')

  useEffect(() => {
    api.logDays().then((r) => {
      setDays(r.days)
      setDay((d) => d || r.today)
    })
  }, [version])

  const [entries] = usePolling(() => (day ? api.logDay(day, { level, actor }) : Promise.resolve([])), 5000, [day, level, actor, version])

  return (
    <>
      <PageHeader title="Nhật ký thao tác" subtitle="Lưu dạng file .txt, mỗi ngày một file (data/logs/YYYY-MM-DD.txt)">
        {day && days?.some((d) => d.day === day) && (
          <a className="button" href={api.logDownloadUrl(day)} download>
            ⤓ Tải file {day}.txt
          </a>
        )}
      </PageHeader>

      <div className="toolbar">
        <div className="actions">
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Chọn ngày">
            {!days?.some((d) => d.day === day) && day && <option value={day}>{day} (chưa có)</option>}
            {days?.map((d) => (
              <option key={d.day} value={d.day}>
                {d.day} · {(d.size / 1024).toFixed(1)} KB
              </option>
            ))}
          </select>
          <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Nguồn">
            {Object.entries(ACTORS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="tabs">
          {Object.entries(LEVELS).map(([k, label]) => (
            <button key={k} className={level === k ? 'active' : ''} onClick={() => setLevel(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!entries?.length ? (
        <Empty>Không có mục nào.</Empty>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mức</th>
                <th>Nguồn</th>
                <th>Thao tác</th>
                <th>Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td className="nowrap">{e.at.slice(11)}</td>
                  <td>
                    <span className={`badge log-${e.level}`}>{LEVELS[e.level] || e.level}</span>
                  </td>
                  <td className="nowrap muted">{e.actor}</td>
                  <td className="nowrap">{ACTIONS[e.action] || e.action}</td>
                  <td>
                    {e.message}
                    {e.target && <div className="muted small">{e.target}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
