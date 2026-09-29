import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'
import { fmtDateTime, usePolling } from '../util.js'
import { Empty, PageHeader } from '../components/common.jsx'

const LEVELS = { '': 'Tất cả', success: 'Thành công', error: 'Lỗi', warn: 'Cảnh báo', info: 'Thông tin' }

export default function Logs() {
  const { openEditor, version } = useApp()
  const [level, setLevel] = useState('')
  const [logs] = usePolling(() => api.logs({ limit: 500 }), 5000, [version])
  const shown = (logs || []).filter((l) => !level || l.level === level)

  return (
    <>
      <PageHeader title="Nhật ký" subtitle="Mọi hoạt động của tool: tải lên, lên lịch, đăng bài, lỗi" />
      <div className="toolbar">
        <div className="tabs">
          {Object.entries(LEVELS).map(([k, label]) => (
            <button key={k} className={level === k ? 'active' : ''} onClick={() => setLevel(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!shown.length ? (
        <Empty>Chưa có hoạt động nào.</Empty>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mức</th>
                <th>Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className={`log ${l.level}`}>
                  <td className="nowrap">{fmtDateTime(l.at)}</td>
                  <td>
                    <span className={`badge log-${l.level}`}>{LEVELS[l.level]}</span>
                  </td>
                  <td>
                    {l.message}
                    {l.videoId && (
                      <button className="link" onClick={() => openEditor(l.videoId)}>
                        xem video
                      </button>
                    )}
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
