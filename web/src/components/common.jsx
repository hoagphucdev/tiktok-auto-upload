import { STATUS_LABEL, fmtDateTime, fmtRelative } from '../util.js'

export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status] || status}</span>
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function When({ iso }) {
  if (!iso) return <span className="muted">—</span>
  return (
    <span title={fmtDateTime(iso)}>
      {fmtDateTime(iso)} <span className="muted">({fmtRelative(iso)})</span>
    </span>
  )
}

export function LogList({ logs }) {
  if (!logs?.length) return <Empty>Chưa có hoạt động nào.</Empty>
  return (
    <ul className="log-list">
      {logs.map((l) => (
        <li key={l.id} className={`log ${l.level}`}>
          <time>{fmtDateTime(l.at)}</time>
          <span>{l.message}</span>
        </li>
      ))}
    </ul>
  )
}
