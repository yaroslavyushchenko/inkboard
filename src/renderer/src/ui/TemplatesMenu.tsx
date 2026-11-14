import { useEffect, useState } from 'react'
import { useT } from '../../../board/i18n'
import { StampIcon } from '../../../board/ui/icons'
import { MenuButton } from '../../../board/ui/InsertMenus'
import { boardLibrary } from '../boardLibrary'
import { useSession } from '../../../board/editorContext'
import { useApp } from '../appState'

export function TemplateThumb({ id, v }: { id: string; v?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void boardLibrary.templateThumbUrl(id).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id, v])
  return <div className="card-thumb">{url ? <img src={url} alt="" draggable={false} /> : <div className="card-thumb-empty" />}</div>
}

export function TemplatesMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const templates = useApp((s) => s.library.templates)
  const hasSelection = useSession((s) => s.selectedIds.length > 0)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <MenuButton icon={<StampIcon />} title={t('tpl.title')} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('tpl.title')}</div>
      {hasSelection && (
        <form
          className="tag-new"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void boardLibrary.saveSelectionAsTemplate(name).then(() => setName(''))
          }}
        >
          <input value={name} placeholder={t('tpl.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="text-btn outline" disabled={!name.trim()}>
            {t('tpl.saveSelection')}
          </button>
        </form>
      )}
      {templates.length === 0 ? (
        <p className="settings-hint">{t('tpl.empty')}</p>
      ) : (
        <div className="template-grid">
          {templates.map((tp) => (
            <div key={tp.id} className="template-card">
              <button
                className="template-open"
                title={t('tpl.insert')}
                onClick={() => {
                  setOpen(false)
                  void boardLibrary.insertTemplate(tp.id)
                }}
              >
                <TemplateThumb id={tp.id} v={tp.updatedAt} />
              </button>
              {editing === tp.id ? (
                <input
                  className="card-title-input"
                  autoFocus
                  defaultValue={tp.name}
                  onBlur={(e) => {
                    setEditing(null)
                    void boardLibrary.renameTemplate(tp.id, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if ((e.code === 'Enter' || e.code === 'NumpadEnter')) (e.target as HTMLInputElement).blur()
                    if (e.code === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <div className="template-name">
                  <span title={tp.name} onDoubleClick={() => setEditing(tp.id)}>
                    {tp.name}
                  </span>
                  <button className="text-btn danger" title={t('tpl.delete')} onClick={() => void boardLibrary.deleteTemplate(tp.id)}>
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </MenuButton>
  )
}
