import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.js'

const ACCEPT = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm'

export default function UploadZone() {
  const { toast, refresh } = useApp()
  const input = useRef(null)
  const [drag, setDrag] = useState(false)
  const [items, setItems] = useState([])

  const update = (name, patch) => setItems((list) => list.map((i) => (i.name === name ? { ...i, ...patch } : i)))

  async function handleFiles(files) {
    const list = [...files]
    if (!list.length) return
    setItems((cur) => [...cur.filter((i) => i.state === 'uploading'), ...list.map((f) => ({ name: f.name, progress: 0, state: 'uploading' }))])
    let ok = 0
    // Tải lần lượt để không nghẽn băng thông với file lớn
    for (const file of list) {
      try {
        await api.upload(file, {}, (p) => update(file.name, { progress: p }))
        update(file.name, { progress: 1, state: 'done' })
        ok++
      } catch (err) {
        update(file.name, { state: 'error', error: err.message })
        toast(`${file.name}: ${err.message}`, 'error')
      }
      refresh()
    }
    if (ok) toast(`Đã tải lên ${ok} video vào mục Nháp`, 'success')
    setTimeout(() => setItems((cur) => cur.filter((i) => i.state !== 'done')), 3000)
  }

  return (
    <div
      className={`upload-zone ${drag ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => input.current.click()}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <strong>Kéo thả video vào đây</strong> hoặc bấm để chọn file (MP4, MOV, WebM, nhiều file cùng lúc)
      {items.length > 0 && (
        <ul className="upload-list" onClick={(e) => e.stopPropagation()}>
          {items.map((i) => (
            <li key={i.name} className={i.state}>
              <span className="clamp-1">{i.name}</span>
              {i.state === 'error' ? (
                <span className="danger-text">{i.error}</span>
              ) : (
                <div className="meter">
                  <div style={{ width: `${Math.round(i.progress * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
