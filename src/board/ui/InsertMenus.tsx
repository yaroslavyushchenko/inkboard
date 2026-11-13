import { useCallback, useState, type ReactNode } from 'react'
import { editor } from '../editor'
import { BUILTIN_GRAPHS, graphBBox, graphSvg, type GraphPreset } from '../engine/graph'
import { lineSvgPath } from '../engine/ink'
import { MAX_BASE, MIN_BASE, SHAPE_BASES, SHAPES_2D, SHAPES_3D, shapeParts, type ShapeKind } from '../engine/shapes'
import type { GraphItem, GraphParams } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { AxesIcon, ChevronDownIcon, CompassIcon, InstrumentsIcon, PolygonIcon, ProtractorIcon, RulerIcon, SetSquare45Icon, SetSquare60Icon, ShapesIcon } from './icons'
import { Popover } from './Popover'

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
        onClick={() => setOpen(!open)}
      >
        {icon}
        <ChevronDownIcon className="menu-caret" />
      </button>
      {open && (
        <Popover onClose={close} className="insert-popover">
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
  const t = useT()
  const [open, setOpen] = useState(false)
  const tool = useUI((s) => s.tool)
  const shape = useUI((s) => s.shape)
  const bases = useUI((s) => s.shapeBases)
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
                useUI.setState({ tool: 'shape', shape: k })
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
          onChange={(n) => useUI.setState((s) => ({ shapeBases: { ...s.shapeBases, [shape]: n } }))}
        />
      )}
      <p className="settings-hint">{t('shapes.hint')}</p>
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
  const t = useT()
  const [open, setOpen] = useState(false)
  const mine = useUI((s) => s.graphPresets)
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
                onDelete={() => useUI.setState((s) => ({ graphPresets: s.graphPresets.filter((x) => x.id !== p.id) }))}
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
          useUI.setState({ graphDialog: { mode: 'insert', params: BUILTIN_GRAPHS[3].params } })
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
          useUI.setState({ fnPanel: { id, session: Date.now() } })
        }}
      >
        <span>{t('graph.functionGraph')}</span>
      </button>
    </MenuButton>
  )
}

export function InstrumentsMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ruler = useUI((s) => s.ruler !== null)
  const setSquare = useUI((s) => s.setSquare?.kind ?? null)
  const protractor = useUI((s) => s.protractor !== null)
  const compass = useUI((s) => s.compass !== null)
  const anyActive = ruler || setSquare !== null || protractor || compass
  const pick = (fn: () => void): void => {
    fn()
    setOpen(false)
  }
  return (
    <MenuButton icon={<InstrumentsIcon />} title={t('instruments.title')} active={anyActive} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('instruments.title')}</div>
      <div className="shape-grid">
        <button className={`shape-btn ${ruler ? 'active' : ''}`} title={t('tool.ruler')} onClick={() => pick(() => editor.toggleRuler())}>
          <RulerIcon />
        </button>
        <button
          className={`shape-btn ${setSquare === 'square45' ? 'active' : ''}`}
          title={t('tool.square45')}
          onClick={() => pick(() => editor.toggleSetSquare('square45'))}
        >
          <SetSquare45Icon />
        </button>
        <button
          className={`shape-btn ${setSquare === 'square60' ? 'active' : ''}`}
          title={t('tool.square60')}
          onClick={() => pick(() => editor.toggleSetSquare('square60'))}
        >
          <SetSquare60Icon />
        </button>
        <button className={`shape-btn ${protractor ? 'active' : ''}`} title={t('tool.protractor')} onClick={() => pick(() => editor.toggleProtractor())}>
          <ProtractorIcon />
        </button>
        <button className={`shape-btn ${compass ? 'active' : ''}`} title={t('tool.compass')} onClick={() => pick(() => editor.toggleCompass())}>
          <CompassIcon />
        </button>
      </div>
      <p className="settings-hint">{t('instruments.hint')}</p>
    </MenuButton>
  )
}
