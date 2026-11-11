import { useCallback, useRef, useState } from 'react'
import { editor } from '../editor'
import { useT } from '../i18n'
import { HIGHLIGHTER_COLORS, HIGHLIGHTER_SIZES, PEN_COLORS, PEN_SIZES, useUI, type InkSlot } from '../store'
import { TEXT_SIZES } from '../engine/text'
import { EraserIcon, HandIcon, ImageIcon, LassoIcon, MoveIcon, PenIcon, ProtractorIcon, RedoIcon, TextIcon, UndoIcon } from './icons'
import { GraphMenu, ShapesMenu, TemplatesMenu } from './InsertMenus'
import { LineStyleControls, SizeSlider } from './LineStyle'
import { Popover } from './Popover'

type Open = { kind: 'pen'; index: number } | { kind: 'highlighter' } | { kind: 'text' } | null

/** Colour and size of new text (text tool popover). */
function TextOptions() {
  const t = useT()
  const style = useUI((s) => s.textStyle)
  const set = (patch: Partial<typeof style>): void => {
    useUI.setState((s) => ({ textStyle: { ...s.textStyle, ...patch } }))
    // Also restyle the text being typed right now.
    const te = useUI.getState().textEdit
    if (te) useUI.setState({ textEdit: { ...te, ...patch } })
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

export function Toolbar() {
  const { tool, activePen, pens, highlighter, canUndo, canRedo } = useUI()
  const protractor = useUI((s) => s.protractor !== null)
  const { selectPen, setTool, updatePen, updateHighlighter } = useUI.getState()
  const [open, setOpen] = useState<Open>(null)
  const close = useCallback(() => setOpen(null), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const t = useT()

  const clickPen = (i: number): void => {
    if (tool === 'pen' && activePen === i) setOpen(open?.kind === 'pen' ? null : { kind: 'pen', index: i })
    else {
      selectPen(i)
      setOpen(null)
    }
  }
  const clickHighlighter = (): void => {
    if (tool === 'highlighter') setOpen(open?.kind === 'highlighter' ? null : { kind: 'highlighter' })
    else {
      setTool('highlighter')
      setOpen(null)
    }
  }

  return (
    <div className="toolbar-wrap">
      <div className="panel toolbar">
        <button
          className={`icon-btn ${tool === 'select' ? 'active' : ''}`}
          title={t('tool.select')}
          onClick={() => {
            setTool('select')
            setOpen(null)
          }}
        >
          <LassoIcon />
        </button>
        <button
          className={`icon-btn ${tool === 'move' ? 'active' : ''}`}
          title={t('tool.move')}
          onClick={() => {
            setTool('move')
            setOpen(null)
          }}
        >
          <MoveIcon />
        </button>
        <div className="sep" />
        <div className="pens">
          {pens.map((p, i) => (
            <button
              key={i}
              data-popover-anchor
              className={`pen ${tool === 'pen' && activePen === i ? 'active' : ''}`}
              title={t('tool.pen', { n: i + 1 })}
              onClick={() => clickPen(i)}
            >
              <PenIcon color={p.color} />
            </button>
          ))}
          <button
            data-popover-anchor
            className={`pen ${tool === 'highlighter' ? 'active' : ''}`}
            title={t('tool.highlighter')}
            onClick={clickHighlighter}
          >
            <PenIcon color={highlighter.color} highlighter />
          </button>
          <button
            className={`pen ${tool === 'eraser' ? 'active' : ''}`}
            title={t('tool.eraser')}
            onClick={() => {
              setTool('eraser')
              setOpen(null)
            }}
          >
            <EraserIcon />
          </button>
        </div>
        <div className="sep" />
        <button
          data-popover-anchor
          className={`icon-btn ${tool === 'text' ? 'active' : ''}`}
          title={t('tool.text')}
          onClick={() => {
            if (tool === 'text') setOpen(open?.kind === 'text' ? null : { kind: 'text' })
            else {
              setTool('text')
              setOpen(null)
            }
          }}
        >
          <TextIcon />
        </button>
        <ShapesMenu />
        <GraphMenu />
        <button className={`icon-btn ${protractor ? 'active' : ''}`} title={t('tool.protractor')} onClick={() => editor.toggleProtractor()}>
          <ProtractorIcon />
        </button>
        <TemplatesMenu />
        <button
          className={`icon-btn ${tool === 'pan' ? 'active' : ''}`}
          title={t('tool.pan')}
          onClick={() => setTool('pan')}
        >
          <HandIcon />
        </button>
        <button className="icon-btn" title={t('tool.image')} onClick={() => fileRef.current?.click()}>
          <ImageIcon />
        </button>
        <div className="sep" />
        <button className="icon-btn" title={t('action.undo')} disabled={!canUndo} onClick={() => editor.undo()}>
          <UndoIcon />
        </button>
        <button className="icon-btn" title={t('action.redo')} disabled={!canRedo} onClick={() => editor.redo()}>
          <RedoIcon />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void editor.insertImages(files)
          }}
        />
      </div>

      {open?.kind === 'pen' && (
        <Popover onClose={close} className="ink-popover">
          <InkOptions
            slot={pens[open.index]}
            colors={PEN_COLORS}
            sizes={PEN_SIZES}
            onChange={(patch) => updatePen(open.index, patch)}
          />
        </Popover>
      )}
      {open?.kind === 'text' && (
        <Popover onClose={close} className="ink-popover">
          <TextOptions />
        </Popover>
      )}
      {open?.kind === 'highlighter' && (
        <Popover onClose={close} className="ink-popover">
          <InkOptions slot={highlighter} colors={HIGHLIGHTER_COLORS} sizes={HIGHLIGHTER_SIZES} onChange={updateHighlighter} />
        </Popover>
      )}
    </div>
  )
}
