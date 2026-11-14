import { useCallback, useState, type ReactNode } from 'react'
import { BUILTIN_GRAPHS, graphBBox, graphSvg, type GraphPreset } from '../engine/graph'
import { lineSvgPath } from '../engine/ink'
import { MAX_BASE, MIN_BASE, SHAPE_BASES, SHAPES_2D, SHAPES_3D, shapeParts, type ShapeKind } from '@inkboard/core/shapes'
import type { GraphItem, GraphParams } from '@inkboard/core/types'
import { useT, type MessageKey } from '../i18n'
import { usePrefs, prefsStore } from '../store'
import { AxesIcon, ChevronDownIcon, CompassIcon, PolygonIcon, ProtractorIcon, RulerIcon, SetSquare45Icon, SetSquare60Icon, ShapesIcon } from './icons'
import { shortcutKey } from '../shortcuts'
import { Popover } from './Popover'
import { useEditor, useSession } from '../editorContext'

/** Toolbar button that opens a popover below the toolbar. */
export function MenuButton({
  icon,
  title,
  active,
  children,
  open,
  setOpen
}: {
  icon: ReactNode
  title: string
  active?: boolean
  children: ReactNode
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const close = useCallback(() => setOpen(false), [setOpen])
  return (
    <div className="menu-anchor">
      <button
        data-popover-anchor
        className={`icon-btn menu-btn ${active ? 'active' : ''} ${open ? 'open' : ''}`}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <ChevronDownIcon className="menu-caret" />
      </button>
      {open && (
        <Popover onClose={close} className="insert-popover" fit="below" toolbar>
          {children}
        </Popover>
      )}
    </div>
  )
}

/** Tiny SVG preview of a shape, drawn with the real outline code. */
export function ShapePreview({ kind, base }: { kind: ShapeKind; base?: number }) {
  const linear = kind === 'line' || kind === 'arrow' || kind === 'doubleArrow'
  const parts = linear ? shapeParts(kind, 4, 20, 24, 8, false, 1.2) : shapeParts(kind, 4, 4, 24, 24, false, 1.2, base)
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      {parts.map((part, i) => (
        <path
          key={i}
          d={lineSvgPath(part.points)}
          fill="none"
          stroke="currentColor"
          strokeWidth={part.dash ? 1.2 : 1.7}
          strokeDasharray={part.dash ? '2.2 2' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/** "Base: △ □ ⬠ ⬡ [n]": number of sides of a pyramid's / prism's base; any n can be typed. */
export function BaseRow({ kind, value, onChange }: { kind: ShapeKind; value: number; onChange: (n: number) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const opts = SHAPE_BASES[kind]
  if (!opts) return null
  const custom = !opts.options.includes(value)
  const commit = (raw: string): void => {
    const n = Math.round(Number(raw))
    if (Number.isFinite(n) && n >= MIN_BASE && n <= MAX_BASE && n !== value) onChange(n)
  }
  return (
    <div className="base-row">
      <span className="base-label">{t('shapes.base')}</span>
      {opts.options.map((n) => (
        <button key={n} className={`shape-btn small ${value === n ? 'active' : ''}`} title={t(`shapes.base${n}` as MessageKey)} onClick={() => onChange(n)}>
          <PolygonIcon n={n} />
        </button>
      ))}
      <label className={`base-n ${custom ? 'active' : ''}`} title={t('shapes.baseN')}>
        <span>n =</span>
        <input
          type="number"
          min={MIN_BASE}
          max={MAX_BASE}
          step={1}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.code === 'Enter' || e.code === 'NumpadEnter') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
    </div>
  )
}

export function ShapesMenu() {
  const editor = useEditor()
  const t = useT()
  const [open, setOpen] = useState(false)
  const tool = useSession((s) => s.tool)
  const shape = useSession((s) => s.shape)
  const bases = usePrefs((s) => s.shapeBases)
  const baseOf = (k: ShapeKind): number | undefined => (SHAPE_BASES[k] ? (bases[k] ?? SHAPE_BASES[k]!.def) : undefined)
  return (
    <MenuButton icon={<ShapesIcon />} title={t('shapes.title')} active={tool === 'shape'} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('shapes.title')}</div>
      {[SHAPES_2D, SHAPES_3D].map((list, i) => (
        <div key={i} className={`shape-grid ${i ? 'solids' : ''}`}>
          {list.map((k) => (
            <button
              key={k}
              className={`shape-btn ${tool === 'shape' && shape === k ? 'active' : ''}`}
              title={t(`shape.${k}` as MessageKey)}
              onClick={() => {
                editor.session.setState({ tool: 'shape', shape: k })
                // Solids with a choice of base keep the menu open so the base can be picked.
                if (!SHAPE_BASES[k]) setOpen(false)
              }}
            >
              <ShapePreview kind={k} base={baseOf(k)} />
            </button>
          ))}
        </div>
      ))}
      {tool === 'shape' && SHAPE_BASES[shape] && (
        <BaseRow
          kind={shape}
          value={baseOf(shape)!}
          onChange={(n) => prefsStore.setState((s) => ({ shapeBases: { ...s.shapeBases, [shape]: n } }))}
        />
      )}
    </MenuButton>
  )
}

/** Ruler, set squares, protractor and compass in one dropdown; each row shows its key. */
export function InstrumentsMenu() {
  const editor = useEditor()
  const t = useT()
  const [open, setOpen] = useState(false)
  const ruler = useSession((s) => s.ruler !== null)
  const square = useSession((s) => s.setSquare?.kind ?? null)
  const protractor = useSession((s) => s.protractor !== null)
  const compass = useSession((s) => s.compass !== null)
  const rows: { id: 'ruler' | 'square45' | 'square60' | 'protractor' | 'compass'; label: MessageKey; icon: ReactNode; on: boolean; toggle: () => void }[] = [
    { id: 'ruler', label: 'toolbar.ruler', icon: <RulerIcon />, on: ruler, toggle: () => editor.toggleRuler() },
    { id: 'square45', label: 'toolbar.square45', icon: <SetSquare45Icon />, on: square === 'square45', toggle: () => editor.toggleSetSquare('square45') },
    { id: 'square60', label: 'toolbar.square60', icon: <SetSquare60Icon />, on: square === 'square60', toggle: () => editor.toggleSetSquare('square60') },
    { id: 'protractor', label: 'instruments.protractor', icon: <ProtractorIcon />, on: protractor, toggle: () => editor.toggleProtractor() },
    { id: 'compass', label: 'toolbar.compass', icon: <CompassIcon />, on: compass, toggle: () => editor.toggleCompass() }
  ]
  return (
    <MenuButton icon={<RulerIcon />} title={t('toolbar.instruments')} active={rows.some((r) => r.on)} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('toolbar.instruments')}</div>
      <div className="instrument-list">
        {rows.map((r) => (
          <button
            key={r.id}
            className={`instrument-row ${r.on ? 'active' : ''}`}
            aria-pressed={r.on}
            aria-keyshortcuts={shortcutKey(r.id)}
            onClick={() => {
              r.toggle()
              setOpen(false)
            }}
          >
            {r.icon}
            <span>{t(r.label)}</span>
            <kbd>{shortcutKey(r.id)}</kbd>
          </button>
        ))}
      </div>
    </MenuButton>
  )
}

function presetLabel(p: GraphPreset, t: (k: MessageKey) => string): string {
  return p.builtin ? t(p.name as MessageKey) : p.name
}

/** Miniature of a coordinate line / plane, drawn with the same code as on the board. */
export function GraphPreview({ params }: { params: GraphParams }) {
  const g: GraphItem = { ...params, type: 'graph', id: 'preview', z: 0, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const b = graphBBox(g)
  return (
    <svg
      className="graph-preview"
      viewBox={`${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      // Built from numbers and validated colours; any formula text goes through graphSvg's XML escaping.
      dangerouslySetInnerHTML={{ __html: graphSvg(g) }}
    />
  )
}

function GraphCard({ preset, label, onInsert, onDelete }: { preset: GraphPreset; label: string; onInsert: () => void; onDelete?: () => void }) {
  return (
    <div className="graph-card">
      <button className="graph-card-btn" title={label} onClick={onInsert}>
        <GraphPreview params={preset.params} />
        <span className="graph-card-label">{label}</span>
      </button>
      {onDelete && (
        <button className="graph-card-del" title={label} onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  )
}

export function GraphMenu() {
  const editor = useEditor()
  const t = useT()
  const [open, setOpen] = useState(false)
  const mine = usePrefs((s) => s.graphPresets)
  const insert = (params: GraphParams): void => {
    editor.insertGraph(params)
    setOpen(false)
  }
  return (
    <MenuButton icon={<AxesIcon />} title={t('graph.title')} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('graph.title')}</div>
      <div className="graph-grid">
        {BUILTIN_GRAPHS.map((p) => (
          <GraphCard key={p.id} preset={p} label={presetLabel(p, t)} onInsert={() => insert(p.params)} />
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <div className="popover-title section">{t('graph.mine')}</div>
          <div className="graph-grid">
            {mine.map((p) => (
              <GraphCard
                key={p.id}
                preset={p}
                label={p.name}
                onInsert={() => insert(p.params)}
                onDelete={() => prefsStore.setState((s) => ({ graphPresets: s.graphPresets.filter((x) => x.id !== p.id) }))}
              />
            ))}
          </div>
        </>
      )}
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          setOpen(false)
          editor.session.setState({ graphDialog: { mode: 'insert', params: BUILTIN_GRAPHS[3].params } })
        }}
      >
        <span>{t('graph.custom')}</span>
      </button>
      <button
        className="menu-item"
        onClick={() => {
          setOpen(false)
          // Insert a plane right away and open the formula panel beside it.
          const id = editor.insertGraph(BUILTIN_GRAPHS[3].params)
          editor.session.setState({ fnPanel: { id, session: Date.now() } })
        }}
      >
        <span>{t('graph.functionGraph')}</span>
      </button>
    </MenuButton>
  )
}

