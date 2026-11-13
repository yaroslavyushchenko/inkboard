import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { editor } from '../editor'
import { useT, type MessageKey } from '../i18n'
import { HIGHLIGHTER_COLORS, HIGHLIGHTER_SIZES, PEN_COLORS, PEN_SIZES, useUI, type InkSlot } from '../store'
import { TEXT_SIZES } from '../engine/text'
import { SHORTCUTS } from '../shortcuts'
import { DEFAULT_TOOLBAR, isToolbarDivider, toolbarToolId, type ToolbarToolId, type ToolbarItemId } from '../toolbarLayout'
import {
  AxesIcon, BrushSelectIcon, ChevronDownIcon, CompassIcon, EraserIcon, FormulaIcon, HandIcon, ImageIcon, LaserIcon, LassoIcon,
  MoveIcon, PenIcon, ProtractorIcon, RedoIcon, RulerIcon, SetSquare45Icon, SetSquare60Icon, ShapesIcon,
  StampIcon, TextIcon, ToolbarSettingsIcon, UndoIcon
} from './icons'
import { GraphMenu, ShapesMenu } from './InsertMenus'
import { LineStyleControls, SizeSlider } from './LineStyle'
import { Popover } from './Popover'
import { ToolbarCustomizer } from './ToolbarCustomizer'

type Open = { kind: 'pen'; index: number } | { kind: 'highlighter' } | { kind: 'text' } | { kind: 'eraser' } | null

interface ToolbarItem {
  label: MessageKey
  title?: MessageKey
  icon: ReactNode
  action?: () => void
  active?: boolean
  disabled?: boolean
  pen?: boolean
  popover?: boolean
  menu?: ReactNode
}

const instrumentShortcuts = new Map<string, string>(SHORTCUTS.filter(({ id }) =>
  id === 'ruler' || id === 'square45' || id === 'square60' || id === 'protractor' || id === 'compass' || id === 'laser'
).map(({ id, display }) => [id, display]))

/** Eraser popover: whole strokes or only what it touches, and its size. */
function EraserOptions() {
  const t = useT()
  const mode = useUI((s) => s.eraserMode)
  const radius = useUI((s) => s.eraserRadius)
  return (
    <>
      <div className="popover-title">{t('eraser.mode')}</div>
      <div className="lang-options">
        {(['stroke', 'point'] as const).map((m) => (
          <button key={m} className={`lang-option ${mode === m ? 'active' : ''}`} onClick={() => useUI.setState({ eraserMode: m })}>
            {t(m === 'stroke' ? 'eraser.stroke' : 'eraser.point')}
          </button>
        ))}
      </div>
      <div className="line-row size-row">
        <span className="line-label">{t('eraser.size')}</span>
        <input
          type="range"
          min={4}
          max={80}
          value={radius}
          aria-label={t('eraser.size')}
          onChange={(e) => useUI.setState({ eraserRadius: Number(e.target.value) })}
        />
        <span className="size-value">{radius}</span>
      </div>
      <p className="settings-hint line-hint">{t('eraser.hint')}</p>
    </>
  )
}

/** Colour and size of new text (text tool popover). */
function TextOptions() {
  const t = useT()
  const style = useUI((s) => s.textStyle)
  const set = (patch: Partial<typeof style>): void => {
    useUI.setState((s) => ({ textStyle: { ...s.textStyle, ...patch } }))
    // Also restyle the text being typed right now.
    editor.formatEditingText(patch)
  }
  return (
    <>
      <div className="swatches">
        {PEN_COLORS.map((c) => (
          <button key={c} className={`swatch ${style.color === c ? 'active' : ''}`} style={{ background: c }} title={c} onClick={() => set({ color: c })} />
        ))}
      </div>
      <div className="sizes">
        {TEXT_SIZES.map((s) => (
          <button key={s} className={`size text-size ${style.size === s ? 'active' : ''}`} title={`${s}`} onClick={() => set({ size: s })}>
            <span style={{ fontSize: 9 + s / 4 }}>A</span>
          </button>
        ))}
      </div>
      <SizeSlider value={style.size} max={160} onChange={(size) => set({ size })} live />
      <p className="settings-hint line-hint">{t('text.hint')}</p>
    </>
  )
}

function InkOptions({
  slot,
  colors,
  sizes,
  onChange
}: {
  slot: InkSlot
  colors: string[]
  sizes: number[]
  onChange: (patch: Partial<InkSlot>) => void
}) {
  const t = useT()
  const maxSize = Math.max(...sizes)
  return (
    <>
      <div className="swatches">
        {colors.map((c) => (
          <button
            key={c}
            className={`swatch ${slot.color === c ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </div>
      <div className="sizes">
        {sizes.map((s) => (
          <button
            key={s}
            className={`size ${slot.size === s ? 'active' : ''}`}
            title={`${s}`}
            onClick={() => onChange({ size: s })}
          >
            <span style={{ width: 6 + (s / maxSize) * 20, height: 6 + (s / maxSize) * 20, background: slot.color }} />
          </button>
        ))}
      </div>
      <SizeSlider value={slot.size} max={maxSize * 3} onChange={(size) => onChange({ size })} live />
      <LineStyleControls value={slot} onChange={onChange} showCaps />
      <p className="settings-hint line-hint">{t('line.endsHint')}</p>
    </>
  )
}

export function Toolbar({ extraTools, menu, settings }: { extraTools?: ReactNode; menu?: ReactNode; settings: ReactNode }) {
  const { tool, activePen, pens, highlighter, canUndo, canRedo, formulaEdit, ruler, setSquare, protractor, compass, toolbarLayout } = useUI()
  const { selectPen, setTool, updatePen, updateHighlighter } = useUI.getState()
  const [open, setOpen] = useState<Open>(null)
  const [customizing, setCustomizing] = useState(false)
  const close = useCallback(() => setOpen(null), [])
  const [draft, setDraft] = useState<ToolbarItemId[] | null>(null)
  const [dragging, setDragging] = useState<ToolbarItemId | null>(null)
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null)
  const gesture = useRef<{ id: ToolbarItemId; pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [scroll, setScroll] = useState({ left: false, right: false })
  const fileRef = useRef<HTMLInputElement>(null)
  const customizeRef = useRef<HTMLButtonElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const available: ToolbarToolId[] = DEFAULT_TOOLBAR.filter((id) => id !== 'templates' || !!extraTools)
  const layout = ((customizing ? draft : toolbarLayout) ?? available).filter((id) => (isToolbarDivider(id) || available.includes(toolbarToolId(id))))

  const updateScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const left = viewport.scrollLeft > 1
    const right = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1
    setScroll((previous) => previous.left === left && previous.right === right ? previous : { left, right })
  }, [])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const items = itemsRef.current
    if (!viewport || !items) return
    updateScroll()
    const observer = new ResizeObserver(updateScroll)
    observer.observe(viewport)
    observer.observe(items)
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey && !event.deltaX && viewport.scrollWidth > viewport.clientWidth) {
        event.preventDefault()
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1
        viewport.scrollLeft += event.deltaY * unit
      }
    }
    viewport.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      viewport.removeEventListener('wheel', wheel)
    }
  }, [updateScroll])

  const endDrag = (): void => {
    setDragging(null)
    setDragPoint(null)
    gesture.current = null
    setDropAt(null)
  }

  const finish = useCallback(() => {
    setCustomizing(false)
    setDragging(null)
    setDragPoint(null)
    gesture.current = null
    setDropAt(null)
    customizeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!customizing) return
    const cancel = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        finish()
      }
    }
    window.addEventListener('keydown', cancel, true)
    return () => window.removeEventListener('keydown', cancel, true)
  }, [customizing, finish])

  const startDrag = (event: ReactPointerEvent, id: ToolbarItemId): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  const dragPosition = (x: number): number => {
    const buttons = Array.from(itemsRef.current?.children ?? [])
    const index = buttons.findIndex((button) => {
      const box = button.getBoundingClientRect()
      return x < box.left + box.width / 2
    })
    return index < 0 ? layout.length : index
  }

  const placeTool = (id: ToolbarItemId, index = layout.length): void => {
    const oldIndex = layout.indexOf(id)
    const next = layout.filter((item) => item !== id)
    const entry: ToolbarItemId = id === 'divider' ? `divider:${crypto.randomUUID()}` : id
    next.splice(oldIndex >= 0 && oldIndex < index ? index - 1 : index, 0, entry)
    setDraft(next)
  }

  const canRemove = dragging !== null && layout.includes(dragging)

  useEffect(() => {
    if (!customizing) return
    const overToolbar = (event: PointerEvent): boolean => {
      const box = viewportRef.current!.getBoundingClientRect()
      return event.clientX >= box.left - 22 && event.clientX <= box.right + 22 &&
        event.clientY >= box.top - 8 && event.clientY <= box.bottom + 8
    }
    const move = (event: PointerEvent): void => {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return
      current.moved = true
      event.preventDefault()
      setDragging(current.id)
      setDragPoint({ x: event.clientX, y: event.clientY })
      const viewport = viewportRef.current!
      const box = viewport.getBoundingClientRect()
      if (overToolbar(event)) {
        if (event.clientX < box.left + 28) viewport.scrollLeft -= 18
        if (event.clientX > box.right - 28) viewport.scrollLeft += 18
        setDropAt(dragPosition(event.clientX))
      } else setDropAt(null)
    }
    const up = (event: PointerEvent): void => {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      if (current.moved) {
        suppressClick.current = true
        if (overToolbar(event)) placeTool(current.id, dragPosition(event.clientX))
        else setDraft(layout.filter((id) => id !== current.id))
        setTimeout(() => { suppressClick.current = false }, 0)
      }
      endDrag()
    }
    const cancel = (): void => endDrag()
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  })

  const pickTool = (next: typeof tool): void => {
    setTool(next)
    close()
  }

  const penItem = (index: number, label: MessageKey): ToolbarItem => ({
    label,
    icon: <PenIcon color={pens[index].color} />,
    pen: true,
    popover: true,
    active: tool === 'pen' && activePen === index,
    action: () => {
      if (tool === 'pen' && activePen === index) {
        setOpen(open?.kind === 'pen' ? null : { kind: 'pen', index })
      } else {
        selectPen(index)
        close()
      }
    }
  })

  const items: Record<ToolbarToolId, ToolbarItem> = {
    divider: { label: 'toolbar.divider', icon: <span className="toolbar-divider-line" aria-hidden /> },
    select: { label: 'toolbar.select', title: 'tool.select', icon: <LassoIcon />, active: tool === 'select', action: () => pickTool('select') },
    brushSelect: { label: 'toolbar.brushSelect', title: 'tool.brushSelect', icon: <BrushSelectIcon />, active: tool === 'brushSelect', action: () => pickTool('brushSelect') },
    move: { label: 'toolbar.move', title: 'tool.move', icon: <MoveIcon />, active: tool === 'move', action: () => pickTool('move') },
    pan: { label: 'toolbar.pan', title: 'tool.pan', icon: <HandIcon />, active: tool === 'pan', action: () => pickTool('pan') },
    pen1: penItem(0, 'toolbar.pen1'),
    pen2: penItem(1, 'toolbar.pen2'),
    pen3: penItem(2, 'toolbar.pen3'),
    highlighter: {
      label: 'toolbar.highlighter',
      title: 'tool.highlighter',
      icon: <PenIcon color={highlighter.color} highlighter />,
      pen: true,
      popover: true,
      active: tool === 'highlighter',
      action: () => {
        if (tool === 'highlighter') setOpen(open?.kind === 'highlighter' ? null : { kind: 'highlighter' })
        else pickTool('highlighter')
      }
    },
    eraser: {
      label: 'toolbar.eraser',
      title: 'tool.eraser',
      icon: <EraserIcon />,
      pen: true,
      popover: true,
      active: tool === 'eraser',
      action: () => {
        if (tool === 'eraser') setOpen(open?.kind === 'eraser' ? null : { kind: 'eraser' })
        else pickTool('eraser')
      }
    },
    laser: { label: 'toolbar.laser', title: 'tool.laser', icon: <LaserIcon />, active: tool === 'laser', action: () => pickTool('laser') },
    text: {
      label: 'toolbar.text',
      title: 'tool.text',
      icon: <TextIcon />,
      active: tool === 'text',
      popover: true,
      action: () => {
        if (tool === 'text') setOpen(open?.kind === 'text' ? null : { kind: 'text' })
        else pickTool('text')
      }
    },
    formula: { label: 'toolbar.formula', title: 'tool.formula', icon: <FormulaIcon />, active: !!formulaEdit, action: () => editor.startFormula() },
    shapes: { label: 'shapes.title', icon: <ShapesIcon />, menu: <ShapesMenu /> },
    graph: { label: 'graph.title', icon: <AxesIcon />, menu: <GraphMenu /> },
    templates: { label: 'tpl.title', icon: <StampIcon />, menu: extraTools },
    image: { label: 'toolbar.image', title: 'tool.image', icon: <ImageIcon />, action: () => fileRef.current?.click() },
    ruler: { label: 'toolbar.ruler', title: 'tool.ruler', icon: <RulerIcon />, active: !!ruler, action: () => editor.toggleRuler() },
    square45: { label: 'toolbar.square45', title: 'tool.square45', icon: <SetSquare45Icon />, active: setSquare?.kind === 'square45', action: () => editor.toggleSetSquare('square45') },
    square60: { label: 'toolbar.square60', title: 'tool.square60', icon: <SetSquare60Icon />, active: setSquare?.kind === 'square60', action: () => editor.toggleSetSquare('square60') },
    protractor: { label: 'instruments.protractor', title: 'tool.protractor', icon: <ProtractorIcon />, active: !!protractor, action: () => editor.toggleProtractor() },
    compass: { label: 'toolbar.compass', title: 'tool.compass', icon: <CompassIcon />, active: !!compass, action: () => editor.toggleCompass() },
    undo: { label: 'toolbar.undo', title: 'action.undo', icon: <UndoIcon />, disabled: !canUndo, action: () => editor.undo() },
    redo: { label: 'toolbar.redo', title: 'action.redo', icon: <RedoIcon />, disabled: !canRedo, action: () => editor.redo() }
  }

  return (
    <>
      {customizing && <div className="toolbar-edit-backdrop" />}
      {dragging && dragPoint && (
        <div className="toolbar-drag-preview panel" style={{ left: dragPoint.x + 12, top: dragPoint.y + 12 }}>
          {items[toolbarToolId(dragging)].icon}<span>{t(items[toolbarToolId(dragging)].label)}</span>
        </div>
      )}
      <header
        className={`panel toolbar ${customizing ? 'is-customizing' : ''}`}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onKeyDown={customizing ? (event) => event.stopPropagation() : undefined}
      >
        {menu && <div className="toolbar-start" inert={customizing}>{menu}</div>}
        <div
          className={`toolbar-scroll ${customizing ? 'is-drop-zone' : ''}`}
        >
          <button
            className="icon-btn toolbar-scroll-arrow"
            type="button"
            aria-label={t('toolbar.scrollLeft')}
            disabled={!scroll.left}
            hidden={!scroll.left && !scroll.right}
            onClick={() => viewportRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
          >
            <ChevronDownIcon className="toolbar-left" />
          </button>
          <div ref={viewportRef} className="toolbar-viewport" onScroll={updateScroll}>
            <div ref={itemsRef} className="toolbar-items" role="group" aria-label={t('toolbar.current')}>
              {layout.map((id, index) => {
                const { label, title, icon, action, active, disabled, pen, popover, menu } = items[toolbarToolId(id)]
                const shortcut = instrumentShortcuts.get(id)
                const tooltip = title ? t(title) : id.startsWith('pen') ? t('tool.pen', { n: id.slice(-1) }) : t(label)
                const marker = dropAt === index ? 'drop-before' : index === layout.length - 1 && dropAt === layout.length ? 'drop-after' : ''
                const options = open?.kind === 'pen' && id === `pen${open.index + 1}`
                  ? <InkOptions slot={pens[open.index]} colors={PEN_COLORS} sizes={PEN_SIZES} onChange={(patch) => updatePen(open.index, patch)} />
                  : open?.kind === 'text' && id === 'text'
                    ? <TextOptions />
                    : open?.kind === 'highlighter' && id === 'highlighter'
                      ? <InkOptions slot={highlighter} colors={HIGHLIGHTER_COLORS} sizes={HIGHLIGHTER_SIZES} onChange={updateHighlighter} />
                      : open?.kind === 'eraser' && id === 'eraser'
                        ? <EraserOptions />
                        : null
                return (
                  <div className={`toolbar-item ${isToolbarDivider(id) ? 'toolbar-divider' : ''} ${marker}`} key={id}>
                    {customizing ? (
                      <button
                        type="button"
                        className={pen ? 'pen' : 'icon-btn'}
                        draggable={false}
                        title={t(label)}
                        aria-label={t(label)}
                        onPointerDown={(event) => startDrag(event, id)}
                        onKeyDown={(event) => {
                          if (event.code === 'Delete' || event.code === 'Backspace') {
                            event.preventDefault()
                            setDraft(layout.filter((item) => item !== id))
                          }
                          if (event.code === 'ArrowLeft' && index > 0) {
                            event.preventDefault()
                            placeTool(id, index - 1)
                          }
                          if (event.code === 'ArrowRight' && index < layout.length - 1) {
                            event.preventDefault()
                            placeTool(id, index + 2)
                          }
                        }}
                      >
                        {icon}
                      </button>
                    ) : isToolbarDivider(id) ? (
                      <span className="toolbar-divider-static" role="separator" aria-orientation="vertical">{icon}</span>
                    ) : menu ?? (
                      <>
                        <button
                          type="button"
                          data-popover-anchor={popover ? '' : undefined}
                          className={`${pen ? 'pen' : 'icon-btn'} ${active ? 'active' : ''}`}
                          aria-label={t(label)}
                          aria-pressed={active}
                          aria-keyshortcuts={shortcut}
                          title={shortcut ? `${tooltip} (${shortcut})` : tooltip}
                          disabled={disabled}
                          onClick={action}
                        >
                          {icon}
                        </button>
                        {options && <Popover onClose={close} className="ink-popover" fit="below" toolbar>{options}</Popover>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {customizing && layout.length === 0 && <span className="toolbar-empty">{t('toolbar.empty')}</span>}
          </div>
          <button
            className="icon-btn toolbar-scroll-arrow"
            type="button"
            aria-label={t('toolbar.scrollRight')}
            disabled={!scroll.right}
            hidden={!scroll.left && !scroll.right}
            onClick={() => viewportRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
          >
            <ChevronDownIcon className="toolbar-right" />
          </button>
        </div>
        <div className="toolbar-end">
          <button
            ref={customizeRef}
            type="button"
            className={`icon-btn toolbar-customize ${customizing ? 'active' : ''}`}
            aria-expanded={customizing}
            aria-label={t('toolbar.customize')}
            title={t('toolbar.customize')}
            onClick={() => {
              if (customizing) finish()
              else {
                close()
                setDraft(toolbarLayout)
                setCustomizing(true)
              }
            }}
          >
            <ToolbarSettingsIcon />
          </button>
          <div inert={customizing}>{settings}</div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void editor.insertImages(files)
          }}
        />
        {customizing && (
          <ToolbarCustomizer
            available={[...available.filter((id) => !layout.includes(id)), 'divider']}
            items={items}
            canRemove={canRemove}
            onAdd={placeTool}
            onPointerDown={startDrag}
            onReset={() => setDraft(null)}
            onSave={() => {
              useUI.setState({ toolbarLayout: draft })
              finish()
            }}
            onClose={finish}
          />
        )}
      </header>
    </>
  )
}
