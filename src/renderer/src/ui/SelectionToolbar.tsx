import { editor } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { useT } from '../i18n'
import { useUI } from '../store'
import { DuplicateIcon, TrashIcon } from './icons'

/** Small floating action bar above the current selection (like Whiteboard's context menu). */
export function SelectionToolbar() {
  const t = useT()
  const selectedIds = useUI((s) => s.selectedIds)
  // Re-render when the camera or items move so the bar follows the selection.
  useUI((s) => s.camera)
  useUI((s) => s.canUndo)
  if (!selectedIds.length) return null
  const box = editor.selectionBBox()
  if (!box) return null
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
      <button className="icon-btn" title={t('sel.duplicate')} onClick={() => editor.duplicateSelection()}>
        <DuplicateIcon />
      </button>
      <button className="icon-btn" title={t('sel.delete')} onClick={() => editor.deleteSelection()}>
        <TrashIcon />
      </button>
    </div>
  )
}
