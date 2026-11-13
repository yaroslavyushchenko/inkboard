import { useCallback, useState } from 'react'
import type { TemplateEntry } from '../../../shared/library'
import { useT } from '../../../board/i18n'
import { BookmarkIcon } from '../../../board/ui/icons'
import { Popover } from '../../../board/ui/Popover'
import { boardLibrary } from '../boardLibrary'
import { TemplateThumb } from './TemplatesMenu'
import { useApp } from '../appState'

export function SaveSelectionTemplate({ side }: { side: 'above' | 'below' }) {
  const t = useT()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [replacing, setReplacing] = useState<TemplateEntry | null>(null)
  const templates = useApp((s) => s.library.templates)
  const close = useCallback(() => {
    setSaving(false)
    setReplacing(null)
  }, [])
  return (
    <div className="menu-anchor">
      <button data-popover-anchor className="icon-btn" title={t('tpl.saveSelection')} onClick={() => setSaving((v) => !v)}>
        <BookmarkIcon />
      </button>
      {saving && (
        <Popover onClose={close} className="sel-popover tpl-popover" fit={side}>
          {replacing ? (
            // Explicit second step, so a template can't be overwritten by a slip of the pen.
            <div className="tpl-confirm">
              <p>{t('tpl.replaceConfirm', { name: replacing.name })}</p>
              <div className="tpl-confirm-actions">
                <button className="text-btn" onClick={() => setReplacing(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="text-btn danger solid"
                  onClick={() => {
                    void boardLibrary.replaceTemplateWithSelection(replacing.id).then(() => {
                      setReplacing(null)
                      setSaving(false)
                    })
                  }}
                >
                  {t('tpl.replaceYes')}
                </button>
              </div>
            </div>
          ) : (
          <>
          <form
            className="tag-new flat"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              void boardLibrary.saveSelectionAsTemplate(name).then(() => {
                setName('')
                setSaving(false)
              })
            }}
          >
            <input autoFocus value={name} placeholder={t('tpl.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="text-btn outline" disabled={!name.trim()}>
              {t('tpl.save')}
            </button>
          </form>
          {templates.length > 0 && (
            <>
              <div className="popover-title section">{t('tpl.replaceTitle')}</div>
              <div className="tpl-replace-list">
                {templates.map((tp) => (
                  <button key={tp.id} className="tpl-replace-item" title={t('tpl.replaceTitle')} onClick={() => setReplacing(tp)}>
                    <TemplateThumb id={tp.id} v={tp.updatedAt} />
                    <span>{tp.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          </>
          )}
        </Popover>
      )}
    </div>
  )
}
