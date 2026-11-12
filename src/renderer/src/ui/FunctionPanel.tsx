import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editor } from '../editor'
import { FN_COLORS, liveFns, MAX_FNS, type FnRow } from '../engine/graph'
import { parseExpr } from '../engine/mathexpr'
import type { GraphItem } from '../engine/types'
import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { dockBeside } from './dock'

const PANEL_W = 320

let nextKey = 1
const rowsOf = (g: GraphItem): FnRow[] =>
  (g.fns ?? []).map((f) => ({ key: nextKey++, expr: f.expr, color: f.color, shown: f.expr }))
const stampOf = (g: GraphItem | undefined): string => (g ? JSON.stringify([g.fns ?? [], !!g.hideFormulas]) : '')
const freeColor = (rows: FnRow[]): string => {
  const used = new Set(rows.map((r) => r.color))
  return FN_COLORS.find((c) => !used.has(c)) ?? FN_COLORS[rows.length % FN_COLORS.length]
}

/**
 * Formulas of one coordinate plane, docked beside it (never on top of it when there is room).
 * Not modal: every key updates the curve on the board right away, so the class watches it change.
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
    const start = r.length ? r : [{ key: nextKey++, expr: '', color: FN_COLORS[0], shown: '' }]
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
    // Remember the stored form (trimmed, validated) so our own edit is not mistaken for an undo.
    const now = editor.scene.getById([g.id])[0]
    written.current = stampOf(now?.type === 'graph' ? now : undefined)
  }
  const setRow = (key: number, patch: Partial<FnRow>): void => write(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)), hide)
  const addRow = (): void => {
    const r: FnRow = { key: nextKey++, expr: '', color: freeColor(rows), shown: '' }
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
        const res = r.expr.trim() ? parseExpr(r.expr) : null
        const err = res && !res.ok ? t(`graph.fnError.${res.code}` as MessageKey, { s: res.detail ?? '' }) : null
        return (
          <div key={r.key} className="fn-item">
            <div className="fn-row">
              <button
                className="fn-color"
                style={{ background: r.color }}
                title={t('graph.fnColor')}
                onClick={() => setRow(r.key, { color: FN_COLORS[(FN_COLORS.indexOf(r.color) + 1) % FN_COLORS.length] })}
              />
              <span className="fn-label">y =</span>
              <input
                className={err ? 'invalid' : ''}
                value={r.expr}
                placeholder="x^2"
                spellCheck={false}
                autoFocus={r.key === focusKey}
                onChange={(e) => setRow(r.key, { expr: e.target.value })}
                onKeyDown={(e) => {
                  if (e.code !== 'Enter' || e.nativeEvent.isComposing) return
                  // Enter: next row, or a new one after the last filled row.
                  const nextRow = rows[i + 1]
                  if (nextRow) document.querySelector<HTMLInputElement>(`[data-fn-key="${nextRow.key}"]`)?.focus()
                  else if (r.expr.trim() && rows.length < MAX_FNS) addRow()
                }}
                data-fn-key={r.key}
              />
              <button className="text-btn danger" title={t('graph.removeFunction')} onClick={() => write(rows.filter((x) => x.key !== r.key), hide)}>
                ×
              </button>
            </div>
            {err && <div className="fn-error">{err}</div>}
          </div>
        )
      })}
      {rows.length < MAX_FNS && (
        <button className="text-btn outline" onClick={addRow}>
          {t('graph.addFunction')}
        </button>
      )}
      <p className="settings-hint">{t('graph.fnHint')}</p>
      <label className="fn-check">
        <input type="checkbox" checked={!hide} onChange={(e) => write(rows, !e.target.checked)} />
        <span>{t('graph.showFormulas')}</span>
      </label>
    </div>
  )
}
