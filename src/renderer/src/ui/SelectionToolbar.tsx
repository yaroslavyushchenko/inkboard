import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { canHaveEnds, editor } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { editableShape } from '../engine/shapeItems'
import { isLinear, SHAPE_BASES, SHAPES_2D, SHAPES_3D, type ShapeKind } from '../engine/shapes'
import { fullRuns, TEXT_SIZES } from '../engine/text'
import type { FormulaItem, StrokeItem, TextItem } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { PEN_COLORS, PEN_SIZES } from '../store'
import { BookmarkIcon, DuplicateIcon, FitIcon, FormulaIcon, FunctionIcon, GearIcon, GroupIcon, LockIcon, ShapesIcon, StyleIcon, TextIcon, TrashIcon, UngroupIcon, UnlockIcon } from './icons'
import { BaseRow, ShapePreview, TemplateThumb } from './InsertMenus'
import type { TemplateEntry } from '../../../shared/library'
import { LineStyleControls, SizeSlider } from './LineStyle'
import { fitBox, screenArea } from './dock'
import { Popover } from './Popover'

/** Small floating action bar above the current selection (like Whiteboard's context menu). */
export function SelectionToolbar() {
  const t = useT()
  const selectedIds = useUI((s) => s.selectedIds)
  const view = useUI((s) => s.view)
  const fnPanel = useUI((s) => s.fnPanel)
  // Re-render when the camera or items move so the bar follows the selection.
  useUI((s) => s.camera)
  useUI((s) => s.sceneVersion)
  const [saving, setSaving] = useState(false)
  const [styling, setStyling] = useState(false)
  const [shaping, setShaping] = useState(false)
  const closeShape = useCallback(() => setShaping(false), [])
  const [name, setName] = useState('')
  const [replacing, setReplacing] = useState<TemplateEntry | null>(null)
  const templates = useUI((s) => s.library.templates)
  const close = useCallback(() => {
    setSaving(false)
    setReplacing(null)
  }, [])
  const closeStyle = useCallback(() => setStyling(false), [])
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 40 })
  useLayoutEffect(() => {
    const el = ref.current
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })
  if (!selectedIds.length || view !== 'board') return null
  const box = editor.selectionBBox()
  if (!box) return null
  const items = editor.selectedItems()
  const anyLocked = items.some((i) => i.locked)
  const allLocked = items.every((i) => i.locked)
  // Formulas that are functions (y = x², f(t) = …) can be plotted on a new plane next to them.
  const plots = items.some((i) => i.type === 'formula') ? editor.selectedPlots().length : 0
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
  const firstFormula = items.find((i): i is FormulaItem => i.type === 'formula' && !i.locked)
  /** What the style panel shows the colour and size of. */
  const styled = first ?? firstText ?? firstFormula
  const resize = (size: number): void => {
    if (firstText) editor.restyleText({ size })
    if (firstFormula) editor.restyleFormula({ size })
  }
  const cam = editor.camera
  // Above the selection when there is room, else below it; always fully inside the window.
  const place = fitBox(
    {
      left: (box.minX - cam.x) * cam.zoom,
      right: (box.maxX - cam.x) * cam.zoom,
      top: (box.minY - cam.y) * cam.zoom - SELECTION_PAD,
      bottom: (box.maxY - cam.y) * cam.zoom + SELECTION_PAD
    },
    size.w,
    size.h,
    screenArea(),
    'above',
    12
  )
  return (
    <div ref={ref} className="panel selection-toolbar" style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
      {graph && (
        <>
          <button
            className="labeled-btn"
            title={t('graph.editTitle')}
            onClick={() => useUI.setState({ graphDialog: { mode: 'edit', id: graph.id, params: { ...graph } } })}
          >
            <GearIcon />
          </button>
          {graph.kind === 'plane' && (
            <button
              className={`labeled-btn ${fnPanel?.id === graph.id ? 'active' : ''}`}
              title={t('graph.plotTitle')}
              onClick={() => useUI.setState({ fnPanel: fnPanel?.id === graph.id ? null : { id: graph.id, session: Date.now() } })}
            >
              <FunctionIcon />
            </button>
          )}
          {graph.kind === 'plane' && !!graph.fns?.length && (
            <button className="labeled-btn" title={t('graph.fit')} onClick={() => editor.fitGraph(graph.id)}>
              <FitIcon />
            </button>
          )}
          <div className="sep" />
        </>
      )}
      {shape && (
        <div className="menu-anchor">
          <button data-popover-anchor className="labeled-btn" title={t('sel.shapeTitle')} onClick={() => setShaping((v) => !v)}>
            <ShapesIcon />
          </button>
          {shaping && (
            <Popover onClose={closeShape} className="sel-popover shape-popover" fit={place.side}>
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
      {firstText && items.length === 1 && (
        <button className="labeled-btn" title={t('text.edit')} onClick={() => editor.editText(firstText)}>
          <TextIcon />
        </button>
      )}
      {firstFormula && items.length === 1 && (
        <button className="labeled-btn" title={t('formula.edit')} onClick={() => editor.editFormula(firstFormula)}>
          <FormulaIcon />
        </button>
      )}
      {plots > 0 && (
        <button className="labeled-btn" title={t(plots > 1 ? 'formula.plotMany' : 'formula.plot', { n: plots })} onClick={() => editor.plotSelected()}>
          <FunctionIcon />
        </button>
      )}
      {styled && (
        <div className="menu-anchor">
          <button data-popover-anchor className="labeled-btn" title={t('sel.style')} onClick={() => setStyling((v) => !v)}>
            <StyleIcon />
          </button>
          {styling && (
            <Popover onClose={closeStyle} className="sel-popover style-popover" fit={place.side}>
              <div className="swatches">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${styled.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => {
                      if (first) editor.restyleSelection({ color: c })
                      if (firstText) editor.restyleText({ color: c })
                      if (firstFormula) editor.restyleFormula({ color: c })
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
                      <button key={sz} className={`size text-size ${styled.size === sz ? 'active' : ''}`} onClick={() => resize(sz)}>
                        <span style={{ fontSize: 9 + sz / 4 }}>A</span>
                      </button>
                    ))}
                  </div>
                  <SizeSlider value={styled.size} max={160} onChange={resize} />
                  {firstText && <TextFormatButtons text={firstText} />}
                </>
              )}
            </Popover>
          )}
        </div>
      )}
      {canGroup && (
        <button className="labeled-btn" title={`${t('sel.group')} (Ctrl+G)`} onClick={() => editor.groupSelection()}>
          <GroupIcon />
        </button>
      )}
      {canUngroup && (
        <button className="labeled-btn" title={`${t('sel.ungroup')} (Ctrl+Shift+G)`} onClick={() => editor.ungroupSelection()}>
          <UngroupIcon />
        </button>
      )}
      {(canGroup || canUngroup) && <div className="sep" />}
      <button
        className={`labeled-btn ${allLocked ? 'locked' : ''}`}
        title={allLocked ? t('sel.unlockTitle') : t('sel.lockTitle')}
        onClick={() => editor.toggleLockSelection()}
      >
        {allLocked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <div className="menu-anchor">
        <button data-popover-anchor className="icon-btn" title={t('tpl.saveSelection')} onClick={() => setSaving((v) => !v)}>
          <BookmarkIcon />
        </button>
        {saving && (
          <Popover onClose={close} className="sel-popover tpl-popover" fit={place.side}>
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
                      void editor.replaceTemplateWithSelection(replacing.id).then(() => {
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
      <button className="icon-btn" title={t('sel.duplicate')} onClick={() => editor.duplicateSelection()}>
        <DuplicateIcon />
      </button>
      <button className="icon-btn" title={t('sel.delete')} disabled={allLocked} onClick={() => editor.deleteSelection()}>
        <TrashIcon />
      </button>
    </div>
  )
}

/** Bold / italic / underline for whole text items (lit when every character has it). */
function TextFormatButtons({ text }: { text: TextItem }) {
  const t = useT()
  const runs = fullRuns(text)
  const all = (k: 'bold' | 'italic' | 'underline'): boolean => runs.every((r) => r[k])
  return (
    <div className="tf-row text-format-row">
      {(['bold', 'italic', 'underline'] as const).map((k) => (
        <button key={k} className={`tf-btn ${all(k) ? 'active' : ''}`} title={t(`text.${k}`)} onClick={() => editor.restyleText({ [k]: !all(k) })}>
          {k === 'bold' ? <b>B</b> : k === 'italic' ? <i>I</i> : <u>U</u>}
        </button>
      ))}
    </div>
  )
}
