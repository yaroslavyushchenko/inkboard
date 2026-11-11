import { useEffect, useState } from 'react'
import type { VersionInfo } from '../../../shared/library'
import { editor } from '../editor'
import { renderThumbnail } from '../engine/export'
import { decodeBoard } from '../engine/serialize'
import { relativeTime, useT } from '../i18n'
import { platform } from '../platform'
import { useUI } from '../store'

function VersionThumb({ boardId, ts }: { boardId: string; ts: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let made: string | null = null
    void (async () => {
      try {
        const data = await decodeBoard(await platform.library.loadVersion(boardId, ts))
        const bytes = await renderThumbnail(data.items, data.background)
        made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }))
        if (alive) setUrl(made)
      } catch {
        // unreadable snapshot: leave the placeholder
      }
    })()
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [boardId, ts])
  return <div className="card-thumb">{url ? <img src={url} alt="" /> : <div className="card-thumb-empty" />}</div>
}

/** Side panel listing automatic snapshots of the open board. */
export function VersionHistory() {
  const t = useT()
  const lang = useUI((s) => s.lang)
  const open = useUI((s) => s.historyOpen)
  const board = useUI((s) => s.board)
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!open || !board) return
    setRestored(false)
    setVersions(null)
    void editor.flush(true).then(() => platform.library.listVersions(board.id)).then(setVersions)
  }, [open, board])

  if (!open || !board) return null
  const fmt = (ts: number): string =>
    new Date(ts).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <aside className="panel history-panel">
      <div className="history-head">
        <h3>{t('history.title')}</h3>
        <button className="text-btn" onClick={() => useUI.setState({ historyOpen: false })}>
          {t('history.close')}
        </button>
      </div>
      <p className="muted">{t('history.hint')}</p>
      {restored && <p className="history-note">{t('history.restored')}</p>}
      {versions && versions.length === 0 && <p className="muted">{t('history.empty')}</p>}
      <div className="history-list">
        {versions?.map((v) => (
          <div key={v.ts} className="history-item">
            <VersionThumb boardId={board.id} ts={v.ts} />
            <div className="history-meta">
              <div>{fmt(v.ts)}</div>
              <div className="muted">{relativeTime(lang, v.ts)}</div>
            </div>
            <button
              className="text-btn outline"
              onClick={async () => {
                await editor.restoreVersion(v.ts)
                setRestored(true)
                setVersions(await platform.library.listVersions(board.id))
              }}
            >
              {t('history.restore')}
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
