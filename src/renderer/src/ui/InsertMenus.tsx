import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { editor } from '../editor'
import { BUILTIN_GRAPHS, graphBBox, graphSvg, type GraphPreset } from '../engine/graph'
import { lineSvgPath } from '../engine/ink'
import { SHAPES, shapeOutline, type ShapeKind } from '../engine/shapes'
import type { GraphItem, GraphParams } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { AxesIcon, ShapesIcon, StampIcon } from './icons'
import { Popover } from './Popover'

/** Toolbar button that opens a popover below the toolbar. */
function MenuButton({
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
      <button data-popover-anchor className={`icon-btn ${active ? 'active' : ''}`} title={title} onClick={() => setOpen(!open)}>
        {icon}
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
export function ShapePreview({ kind }: { kind: ShapeKind }) {
  const linear = kind === 'line' || kind === 'arrow' || kind === 'doubleArrow'
  const pts = linear ? shapeOutline(kind, 4, 20, 24, 8, false, 1.2) : shapeOutline(kind, 4, 5, 24, 23, false, 1.2)
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d={lineSvgPath(pts)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ShapesMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const tool = useUI((s) => s.tool)
  const shape = useUI((s) => s.shape)
  return (
    <MenuButton icon={<ShapesIcon />} title={t('shapes.title')} active={tool === 'shape'} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('shapes.title')}</div>
      <div className="shape-grid">
        {SHAPES.map((k) => (
          <button
            key={k}
            className={`shape-btn ${tool === 'shape' && shape === k ? 'active' : ''}`}
            title={t(`shape.${k}` as MessageKey)}
            onClick={() => {
              useUI.setState({ tool: 'shape', shape: k })
              setOpen(false)
            }}
          >
            <ShapePreview kind={k} />
          </button>
        ))}
      </div>
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
      // Generated from numbers only (no user text), so it's safe to inline.
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
    </MenuButton>
  )
}

function TemplateThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void editor.templateThumbUrl(id).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id])
  return <div className="card-thumb">{url ? <img src={url} alt="" draggable={false} /> : <div className="card-thumb-empty" />}</div>
}

export function TemplatesMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const templates = useUI((s) => s.library.templates)
  const hasSelection = useUI((s) => s.selectedIds.length > 0)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <MenuButton icon={<StampIcon />} title={t('tpl.title')} open={open} setOpen={setOpen}>
      <div className="popover-title">{t('tpl.title')}</div>
      {hasSelection && (
        <form
          className="tag-new"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void editor.saveSelectionAsTemplate(name).then(() => setName(''))
          }}
        >
          <input value={name} placeholder={t('tpl.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="text-btn outline" disabled={!name.trim()}>
            {t('tpl.saveSelection')}
          </button>
        </form>
      )}
      {templates.length === 0 ? (
        <p className="settings-hint">{t('tpl.empty')}</p>
      ) : (
        <div className="template-grid">
          {templates.map((tp) => (
            <div key={tp.id} className="template-card">
              <button
                className="template-open"
                title={t('tpl.insert')}
                onClick={() => {
                  setOpen(false)
                  void editor.insertTemplate(tp.id)
                }}
              >
                <TemplateThumb id={tp.id} />
              </button>
              {editing === tp.id ? (
                <input
                  className="card-title-input"
                  autoFocus
                  defaultValue={tp.name}
                  onBlur={(e) => {
                    setEditing(null)
                    void editor.renameTemplate(tp.id, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <div className="template-name">
                  <span title={tp.name} onDoubleClick={() => setEditing(tp.id)}>
                    {tp.name}
                  </span>
                  <button className="text-btn danger" title={t('tpl.delete')} onClick={() => void editor.deleteTemplate(tp.id)}>
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {templates.length > 0 && <p className="settings-hint">{t('tpl.hint')}</p>}
    </MenuButton>
  )
}
