import { useCallback, useState } from 'react'
import { canHaveEnds, editor } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { editableShape } from '../engine/shapeItems'
import { isLinear, SHAPE_BASES, SHAPES_2D, SHAPES_3D, type ShapeKind } from '../engine/shapes'
import { TEXT_SIZES } from '../engine/text'
import type { StrokeItem, TextItem } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { PEN_COLORS, PEN_SIZES } from '../store'
import { BookmarkIcon, DuplicateIcon, GearIcon, GroupIcon, LockIcon, ShapesIcon, StyleIcon, TrashIcon, UngroupIcon, UnlockIcon } from './icons'
import { BaseRow, ShapePreview } from './InsertMenus'
import { LineStyleControls, SizeSlider } from './LineStyle'
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
  const [shaping, setShaping] = useState(false)
  const closeShape = useCallback(() => setShaping(false), [])
  const [name, setName] = useState('')
  const close = useCallback(() => setSaving(false), [])
  const closeStyle = useCallback(() => setStyling(false), [])
  if (!selectedIds.length || view !== 'board') return null
  const box = editor.selectionBBox()
  if (!box) return null
  const items = editor.selectedItems()
  const anyLocked = items.some((i) => i.locked)
  const allLocked = items.every((i) => i.locked)
  const graph = !anyLocked && items.length === 1 && items[0].type === 'graph' ? items[0] : null
  const shape = anyLocked ? null : editableShape(items)
  // Shapes can be switched within their family: lines, flat shapes, solids.
  const family: readonly ShapeKind[] = !shape
    ? []
    : isLinear(shape.spec.kind)
      ? SHAPES_2D.filter((k) => isLinear(k))
      : (SHAPES_3D as readonly ShapeKind[]).includes(shape.spec.kind)
        ? SHAPES_3D
        : SHAPES_2D.filter((k) => !isLinear(k))
  const firstGroup = items[0]?.groupId
  const oneGroup = !!firstGroup && items.every((i) => i.groupId === firstGroup)
  const canGroup = items.length >= 2 && !oneGroup
  // A solid's own group (its edges) isn't something to ungroup; that would only break the shape.
  const anyShape = editableShape(items)
  const shapeGid = anyShape?.parts[0].groupId
  const ownShapeGroup = !!shapeGid && editor.scene.getItems().filter((i) => i.groupId === shapeGid).length === anyShape!.parts.length
  const canUngroup = items.some((i) => i.groupId) && !ownShapeGroup
  const strokes = items.filter((i): i is StrokeItem => i.type === 'stroke' && !i.locked)
  const first = strokes[0]
  const hasStraight = strokes.some(canHaveEnds)
  const firstText = items.find((i): i is TextItem => i.type === 'text' && !i.locked)
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
      {shape && (
        <div className="menu-anchor">
          <button data-popover-anchor className="labeled-btn" title={t('sel.shapeTitle')} onClick={() => setShaping((v) => !v)}>
            <ShapesIcon />
            <span>{t('sel.shape')}</span>
          </button>
          {shaping && (
            <Popover onClose={closeShape} className="sel-popover shape-popover">
              <div className="shape-grid">
                {family.map((k) => (
                  <button
                    key={k}
                    className={`shape-btn ${shape.spec.kind === k ? 'active' : ''}`}
                    title={t(`shape.${k}` as MessageKey)}
                    onClick={() => editor.updateShape({ kind: k })}
                  >
                    <ShapePreview kind={k} base={k === shape.spec.kind ? shape.spec.base : undefined} />
                  </button>
                ))}
              </div>
              {SHAPE_BASES[shape.spec.kind] && (
                <BaseRow
                  kind={shape.spec.kind}
                  value={shape.spec.base ?? SHAPE_BASES[shape.spec.kind]!.def}
                  onChange={(n) => editor.updateShape({ base: n })}
                />
              )}
            </Popover>
          )}
        </div>
      )}
      {(first || firstText) && (
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
                    className={`swatch ${(first ?? firstText)!.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => {
                      if (first) editor.restyleSelection({ color: c })
                      if (firstText) editor.restyleText({ color: c })
                    }}
                  />
                ))}
              </div>
              {first ? (
                <>
                  <div className="sizes">
                    {PEN_SIZES.map((sz) => (
                      <button key={sz} className={`size ${first.size === sz ? 'active' : ''}`} onClick={() => editor.restyleSelection({ size: sz })}>
                        <span style={{ width: 6 + (sz / 12) * 20, height: 6 + (sz / 12) * 20, background: first.color }} />
                      </button>
                    ))}
                  </div>
                  <SizeSlider value={first.size} max={40} onChange={(size) => editor.restyleSelection({ size })} />
                  <LineStyleControls value={first} onChange={(p) => editor.restyleSelection(p)} showCaps={hasStraight} />
                </>
              ) : (
                <>
                  <div className="sizes">
                    {TEXT_SIZES.map((sz) => (
                      <button key={sz} className={`size text-size ${firstText!.size === sz ? 'active' : ''}`} onClick={() => editor.restyleText({ size: sz })}>
                        <span style={{ fontSize: 9 + sz / 4 }}>A</span>
                      </button>
                    ))}
                  </div>
                  <SizeSlider value={firstText!.size} max={160} onChange={(size) => editor.restyleText({ size })} />
                </>
              )}
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
      <button
        className={`labeled-btn ${allLocked ? 'locked' : ''}`}
        title={allLocked ? t('sel.unlockTitle') : t('sel.lockTitle')}
        onClick={() => editor.toggleLockSelection()}
      >
        {allLocked ? <LockIcon /> : <UnlockIcon />}
        <span>{allLocked ? t('sel.unlock') : t('sel.lock')}</span>
      </button>
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
      <button className="icon-btn" title={t('sel.delete')} disabled={allLocked} onClick={() => editor.deleteSelection()}>
        <TrashIcon />
      </button>
    </div>
  )
}
