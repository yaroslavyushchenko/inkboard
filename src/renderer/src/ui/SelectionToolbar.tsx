import { useCallback, useState } from 'react'
import { editor } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { useT } from '../i18n'
import { useUI } from '../store'
import { BookmarkIcon, DuplicateIcon, GearIcon, TrashIcon } from './icons'
import { Popover } from './Popover'

/** Small floating action bar above the current selection (like Whiteboard's context menu). */
export function SelectionToolbar() {
  const t = useT()
  const selectedIds = useUI((s) => s.selectedIds)
  const view = useUI((s) => s.view)
  // Re-render when the camera or items move so the bar follows the selection.
  useUI((s) => s.camera)
  useUI((s) => s.canUndo)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const close = useCallback(() => setSaving(false), [])
  if (!selectedIds.length || view !== 'board') return null
  const box = editor.selectionBBox()
  if (!box) return null
  const items = editor.selectedItems()
  const graph = items.length === 1 && items[0].type === 'graph' ? items[0] : null
  const cam = editor.camera
  const left = ((box.minX + box.maxX) / 2 - cam.x) * cam.zoom
  const top = (box.minY - cam.y) * cam.zoom - SELECTION_PAD
  const below = top < 64
  const y = below ? (box.maxY - cam.y) * cam.zoom + SELECTION_PAD + 12 : top - 12
  return (
    <div
      className="panel selection-toolbar"
      style={{ left, top: y, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {graph && (
        <button
          className="icon-btn"
          title={t('graph.editTitle')}
          onClick={() => useUI.setState({ graphDialog: { mode: 'edit', id: graph.id, params: { ...graph } } })}
        >
          <GearIcon />
        </button>
      )}
      <div className="menu-anchor">
        <button data-popover-anchor className="icon-btn" title={t('tpl.saveSelection')} onClick={() => setSaving((v) => !v)}>
          <BookmarkIcon />
        </button>
        {saving && (
          <Popover onClose={close} className="sel-popover">
            <form
              className="tag-new flat"
              onSubmit={(e) => {
                e.preventDefault()
                if (!name.trim()) return
                void editor.saveSelectionAsTemplate(name).then(() => {
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
          </Popover>
        )}
      </div>
      <button className="icon-btn" title={t('sel.duplicate')} onClick={() => editor.duplicateSelection()}>
        <DuplicateIcon />
      </button>
      <button className="icon-btn" title={t('sel.delete')} onClick={() => editor.deleteSelection()}>
        <TrashIcon />
      </button>
    </div>
  )
}
