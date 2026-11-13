import { useId, type PointerEvent, type ReactNode } from 'react'
import { useT, type MessageKey } from '../i18n'
import type { ToolbarItemId, ToolbarToolId } from '../toolbarLayout'
import { SHORTCUTS } from '../shortcuts'

interface Props {
  available: ToolbarToolId[]
  items: Record<ToolbarToolId, { label: MessageKey; icon: ReactNode }>
  canRemove: boolean
  onAdd: (id: ToolbarItemId) => void
  onPointerDown: (event: PointerEvent, id: ToolbarItemId) => void
  onReset: () => void
  onSave: () => void
  onClose: () => void
}

export function ToolbarCustomizer({ available, items, canRemove, onAdd, onPointerDown, onReset, onSave, onClose }: Props) {
  const t = useT()
  const titleId = useId()
  const hintId = useId()

  return (
    <section
      className="panel toolbar-dialog"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={hintId}
    >
      <header className="toolbar-dialog-header">
        <h2 id={titleId}>{t('toolbar.customize')}</h2>
        <p id={hintId}>{t('toolbar.hint')}</p>
      </header>
      <div className={`toolbar-palette ${canRemove ? 'drop-active' : ''}`} role="group" aria-label={t('toolbar.available')}>
        {available.length === 0 && <p>{t('toolbar.allShown')}</p>}
        {available.map((id) => {
          const shortcut = SHORTCUTS.find((item) => item.id === id)?.display
          return (
            <button
              key={id}
              type="button"
              className="toolbar-tile"
              draggable={false}
              onClick={() => onAdd(id)}
              onPointerDown={(event) => onPointerDown(event, id)}
            >
              <span className="toolbar-tile-icon">{items[id].icon}</span>
              <span>{t(items[id].label)}</span>
              {shortcut && <kbd>{shortcut}</kbd>}
            </button>
          )
        })}
      </div>
      <footer className="toolbar-dialog-footer">
        <button type="button" className="text-btn outline" onClick={onReset}>{t('toolbar.reset')}</button>
        <div>
          <button type="button" className="text-btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="text-btn primary" onClick={onSave}>{t('toolbar.done')}</button>
        </div>
      </footer>
    </section>
  )
}
