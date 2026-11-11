import { useCallback, useState } from 'react'
import { editor } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { useT } from '../i18n'
import { useUI } from '../store'
import { PEN_COLORS, PEN_SIZES } from '../store'
import { BookmarkIcon, DuplicateIcon, GearIcon, GroupIcon, StyleIcon, TrashIcon, UngroupIcon } from './icons'
import { LineStyleControls } from './LineStyle'
import { Popover } from './Popover'

/** Small floating action bar above the current selection (like Whiteboard's context menu). */
export function SelectionToolbar() {
  const t = useT()
  const selectedIds = useUI((s) => s.selectedIds)
  const view = useUI((s) => s.view)
  // Re-render when the camera or items move so the bar follows the selection.
  useUI((s) => s.camera)
  useUI((s) => s.sceneVersion)
  const [saving, setSaving] = useState(false)
  const [styling, setStyling] = useState(false)
  const [name, setName] = useState('')
  const close = useCallback(() => setSaving(false), [])
  const closeStyle = useCallback(() => setStyling(false), [])
  if (!selectedIds.length || view !== 'board') return null
  const box = editor.selectionBBox()
  if (!box) return null
  const items = editor.selectedItems()
  const graph = items.length === 1 && items[0].type === 'graph' ? items[0] : null
  const firstGroup = items[0]?.groupId
  const oneGroup = !!firstGroup && items.every((i) => i.groupId === firstGroup)
  const canGroup = items.length >= 2 && !oneGroup
  const canUngroup = items.some((i) => i.groupId)
  const strokes = items.filter((i) => i.type === 'stroke')
  const first = strokes[0]
  const hasStraight = strokes.some((s) => s.geom === 'line' && s.points.length === 2)
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
        <>
          <button
            className="labeled-btn"
            title={t('graph.editTitle')}
            onClick={() => useUI.setState({ graphDialog: { mode: 'edit', id: graph.id, params: { ...graph } } })}
          >
            <GearIcon />
            <span>{t('sel.settings')}</span>
          </button>
          <div className="sep" />
        </>
      )}
      {first && (
        <div className="menu-anchor">
          <button data-popover-anchor className="labeled-btn" title={t('sel.style')} onClick={() => setStyling((v) => !v)}>
            <StyleIcon />
            <span>{t('sel.style')}</span>
          </button>
          {styling && (
            <Popover onClose={closeStyle} className="sel-popover style-popover">
              <div className="swatches">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${first.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => editor.restyleSelection({ color: c })}
                  />
                ))}
              </div>
              <div className="sizes">
                {PEN_SIZES.map((sz) => (
                  <button key={sz} className={`size ${first.size === sz ? 'active' : ''}`} onClick={() => editor.restyleSelection({ size: sz })}>
                    <span style={{ width: 6 + (sz / 12) * 20, height: 6 + (sz / 12) * 20, background: first.color }} />
                  </button>
                ))}
              </div>
              <LineStyleControls value={first} onChange={(p) => editor.restyleSelection(p)} showCaps={hasStraight} />
            </Popover>
          )}
        </div>
      )}
      {canGroup && (
        <button className="labeled-btn" title={`${t('sel.group')} (Ctrl+G)`} onClick={() => editor.groupSelection()}>
          <GroupIcon />
          <span>{t('sel.group')}</span>
          <kbd>Ctrl+G</kbd>
        </button>
      )}
      {canUngroup && (
        <button className="labeled-btn" title={`${t('sel.ungroup')} (Ctrl+Shift+G)`} onClick={() => editor.ungroupSelection()}>
          <UngroupIcon />
          <span>{t('sel.ungroup')}</span>
          <kbd>Ctrl+Shift+G</kbd>
        </button>
      )}
      {(canGroup || canUngroup) && <div className="sep" />}
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
