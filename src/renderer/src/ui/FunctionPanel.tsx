import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editor } from '../editor'
import { isBlank, type FormulaState, type Row } from '../engine/formula'
import { fnHead, FN_NAMES, FN_VARS, isEquation, nodeToRows, parseRows, plotHead, renameVar } from '../engine/formulaexpr'
import { FN_COLORS, liveFns, MAX_FNS, type FnRow } from '../engine/graph'
import { parseExpr } from '../engine/mathexpr'
import type { GraphItem, PlotFn } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { dockBeside } from './dock'
import { FormulaField } from './FormulaField'
import { Popover } from './Popover'

const PANEL_W = 320

let nextKey = 1
const at = (rows: Row): FormulaState => ({ rows, cur: { path: [], i: rows.length } })
/** The formula of a stored function: its keypad form, or its text turned into one (older boards). */
function rowsOfFn(f: PlotFn): Row {
  if (f.rows) return f.rows
  const r = parseExpr(f.expr)
  return r.ok ? nodeToRows(r.node, r.comma) : [...f.expr].filter((ch) => ch.trim()).map((s) => ({ t: 'c', s }) as const)
}
const rowsOf = (g: GraphItem): FnRow[] =>
  (g.fns ?? []).map((f) => {
    // A left side typed into the formula (x = y², w(z) = …) stays there, as it was written.
    const rows = rowsOfFn(f)
    return { key: nextKey++, color: f.color, st: at(rows), shown: rows, name: f.name, arg: f.arg, from: f.from, to: f.to, yFrom: f.yFrom, yTo: f.yTo }
  })
const blankRow = (color: string): FnRow => ({ key: nextKey++, color, st: at([]), shown: null })
const stampOf = (g: GraphItem | undefined): string => (g ? JSON.stringify([g.fns ?? [], !!g.hideFormulas]) : '')
const freeColor = (rows: FnRow[]): string => {
  const used = new Set(rows.map((r) => r.color))
  return FN_COLORS.find((c) => !used.has(c)) ?? FN_COLORS[rows.length % FN_COLORS.length]
}
/** The left side as the panel shows it: y =, y(t) =, f(x) =. */
const headText = (name: string, arg: string): string => (name === 'y' && arg === 'x' ? 'y =' : `${name}(${arg}) =`)

/** A number typed with a dot or a comma; empty = no limit. Keeps what is typed while it is half done (−, 2,). */
function LimitInput({ value, onChange, title }: { value: number | undefined; onChange: (v: number | undefined) => void; title: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [editing, setEditing] = useState(false)
  const comma = useUI((s) => s.lang) === 'uk'
  const shown = editing ? text : value === undefined ? '' : String(value).replace('-', '−').replace('.', comma ? ',' : '.')
  return (
    <input
      className="fn-limit"
      inputMode="decimal"
      title={title}
      value={shown}
      onFocus={() => {
        setText(shown)
        setEditing(true)
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value)
        const s = e.target.value.trim().replace(/[−–]/g, '-').replace(',', '.')
        if (!s) onChange(undefined)
        else if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) onChange(Number(s))
      }}
      onKeyDown={(e) => {
        if (e.code === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** The left side of a function: opens the choice of its name and its variable. */
function HeadPicker({ name, arg, onPick }: { name: string; arg: string; onPick: (name: string, arg: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="menu-anchor">
      <button data-popover-anchor className="fn-label fn-head" title={t('graph.fnHead')} onClick={() => setOpen((v) => !v)}>
        {headText(name, arg)}
      </button>
      {open && (
        <Popover onClose={close} className="fn-head-popover" fit="below">
          <div className="fn-head-title">{t('graph.fnName')}</div>
          <div className="fn-head-chips">
            {FN_NAMES.map((n) => (
              <button key={n} className={`chip fn-chip ${n === name ? 'active' : ''}`} disabled={n === arg} onClick={() => onPick(n, arg)}>
                {n}
              </button>
            ))}
          </div>
          <div className="fn-head-title">{t('graph.fnVar')}</div>
          <div className="fn-head-chips">
            {FN_VARS.map((v) => (
              <button key={v} className={`chip fn-chip ${v === arg ? 'active' : ''}`} disabled={v === name} onClick={() => onPick(name, v)}>
                {v}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

const focusRow = (key: number): void => document.querySelector<HTMLElement>(`[data-fn-key="${key}"] .formula-field`)?.focus()

/**
 * Formulas of one coordinate plane, docked beside it (never on top of it when there is room).
 * Not modal: every key updates the curve on the board right away, so the class watches it change.
 * Each formula is a keypad field (the math keypad opens while one has the focus); typing on the
 * keyboard works as before (`x^2`, `1/x`, `sqrt`).
 */
export function FunctionPanel() {
  const t = useT()
  const panel = useUI((s) => s.fnPanel)
  const view = useUI((s) => s.view)
  // Follow the plane when the board is panned / zoomed or the plane moves.
  useUI((s) => s.camera)
  const sceneVersion = useUI((s) => s.sceneVersion)
  const [rows, setRows] = useState<FnRow[]>([])
  const [hide, setHide] = useState(false)
  const [focusKey, setFocusKey] = useState<number | null>(null)
  /** What this panel last wrote, to tell its own edits from undo / redo. */
  const written = useRef('')
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(300)

  const item = panel ? editor.scene.getById([panel.id])[0] : undefined
  const g = item?.type === 'graph' ? item : null
  const stamp = stampOf(g ?? undefined)

  /** Which opening of the panel the rows belong to: a new one always reloads them from its plane. */
  const opened = useRef('')

  // Load the plane's formulas when the panel opens, and again if they change from outside (undo).
  useEffect(() => {
    if (!g || !panel) return
    const opening = `${panel.id}:${panel.session}`
    if (opening === opened.current && stamp === written.current) return
    opened.current = opening
    const r = rowsOf(g)
    const start = r.length ? r : [blankRow(FN_COLORS[0])]
    setRows(start)
    setHide(!!g.hideFormulas)
    written.current = stamp
    if (!r.length) setFocusKey(start[0].key)
  }, [panel?.id, panel?.session, sceneVersion])

  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight)
  })

  if (!panel || !g || view !== 'board') return null

  const write = (nextRows: FnRow[], nextHide: boolean): void => {
    const live = liveFns(nextRows)
    setRows(live.rows)
    setHide(nextHide)
    editor.setGraphFns(g.id, live.fns, nextHide, panel.session)
    // Remember the stored form (validated) so our own edit is not mistaken for an undo.
    const now = editor.scene.getById([g.id])[0]
    written.current = stampOf(now?.type === 'graph' ? now : undefined)
  }
  const setRow = (key: number, patch: Partial<FnRow>): void => write(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)), hide)
  const addRow = (): void => {
    const r = blankRow(freeColor(rows))
    setFocusKey(r.key)
    write([...rows, r], hide)
  }
  const close = (): void => {
    useUI.setState({ fnPanel: null })
  }

  const { left, top } = dockBeside(g.bbox, editor.camera, PANEL_W, height)

  return (
    <div
      ref={ref}
      className="panel fn-panel"
      style={{ left, top, width: PANEL_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.code === 'Escape') close()
      }}
    >
      <div className="fn-panel-head">
        <span className="fn-title">{t('graph.functions')}</span>
        <button className="text-btn" title={t('common.close')} onClick={close}>
          ✕
        </button>
      </div>
      {rows.map((r, i) => {
        const head = fnHead({ rows: r.st.rows, name: r.name, arg: r.arg })
        // A formula with its own left side (s(t) =, x = y², x² + y² = 4) needs no button for one.
        const ownHead = isEquation(r.st.rows) || plotHead(r.st.rows).len > 0
        const res = isBlank(r.st.rows) ? null : parseRows(r.st.rows, r.arg)
        const bad = res && !res.ok ? res : null
        // y on its own is the vertical axis: it takes an equation (x = y², x² + y² = 4).
        const code = bad?.code === 'unknownName' && bad.detail === 'y' ? 'yAxis' : bad?.code
        const err = bad ? t(`graph.fnError.${code}` as MessageKey, { s: bad.detail ?? '', v: head.arg }) : null
        return (
          <div key={r.key} className="fn-item">
            <div className="fn-row" data-fn-key={r.key}>
              <button
                className="fn-color"
                style={{ background: r.color }}
                title={t('graph.fnColor')}
                onClick={() => setRow(r.key, { color: FN_COLORS[(FN_COLORS.indexOf(r.color) + 1) % FN_COLORS.length] })}
              />
              {!ownHead && (
                <HeadPicker
                  name={head.name}
                  arg={head.arg}
                  onPick={(name, arg) => {
                    // A left side typed into the formula gives way to the one picked here.
                    const len = plotHead(r.st.rows).len
                    let st = len ? at(r.st.rows.slice(len)) : r.st
                    // A new variable is written into the formula too: x² becomes t².
                    if (arg !== head.arg) st = at(renameVar(st.rows, head.arg, arg))
                    setRow(r.key, { st, name, arg })
                  }}
                />
              )}
              <FormulaField
                className={`fn-field ${bad ? 'invalid' : ''}`}
                value={r.st}
                onChange={(st) => setRow(r.key, { st })}
                size={20}
                pad={7}
                plot
                autoFocus={r.key === focusKey}
                errorAt={bad?.at}
                onCancel={close}
                onDone={() => {
                  // Enter: next row, or a new one after the last filled row.
                  const nextRow = rows[i + 1]
                  if (nextRow) focusRow(nextRow.key)
                  else if (!isBlank(r.st.rows) && rows.length < MAX_FNS) addRow()
                }}
              />
              <button className="text-btn danger" title={t('graph.removeFunction')} onClick={() => write(rows.filter((x) => x.key !== r.key), hide)}>
                ×
              </button>
            </div>
            {err && <div className="fn-error">{err}</div>}
            <div className="fn-range" title={t('graph.fnRange')}>
              <span className="fn-range-var">{head.arg}</span>
              <span>{t('graph.fnFrom')}</span>
              <LimitInput title={t('graph.fnRange')} value={r.from} onChange={(from) => setRow(r.key, { from })} />
              <span>{t('graph.fnTo')}</span>
              <LimitInput title={t('graph.fnRange')} value={r.to} onChange={(to) => setRow(r.key, { to })} />
            </div>
            <div className="fn-range" title={t('graph.fnYRange')}>
              <span className="fn-range-var">{head.name}</span>
              <span>{t('graph.fnFrom')}</span>
              <LimitInput title={t('graph.fnYRange')} value={r.yFrom} onChange={(yFrom) => setRow(r.key, { yFrom })} />
              <span>{t('graph.fnTo')}</span>
              <LimitInput title={t('graph.fnYRange')} value={r.yTo} onChange={(yTo) => setRow(r.key, { yTo })} />
            </div>
          </div>
        )
      })}
      <div className="fn-actions">
        {rows.length < MAX_FNS && (
          <button className="text-btn outline" onClick={addRow}>
            {t('graph.addFunction')}
          </button>
        )}
        {!!g.fns?.length && (
          <button className="text-btn outline" title={t('graph.fit')} onClick={() => editor.fitGraph(g.id)}>
            {t('graph.fitShort')}
          </button>
        )}
      </div>
      <p className="settings-hint">{t('graph.fnHint')}</p>
      <label className="fn-check">
        <input type="checkbox" checked={!hide} onChange={(e) => write(rows, !e.target.checked)} />
        <span>{t('graph.showFormulas')}</span>
      </label>
    </div>
  )
}
