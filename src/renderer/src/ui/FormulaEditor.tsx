import { useEffect, useMemo, useState } from 'react'
import { editor } from '../editor'
import type { FormulaState, Row } from '../engine/formula'
import { numericResult } from '../engine/formulaexpr'
import { caretOf, typesetRows } from '../engine/formulatype'
import { useT } from '../i18n'
import { useUI } from '../store'
import { FormulaField } from './FormulaField'
import { MathSvg } from './MathSvg'

const PAD = 8

/**
 * The formula being built on the board: an editable field exactly where the formula will be drawn,
 * at the board's zoom. When the formula is plain arithmetic, a "Show answer" button sits beside it
 * (so the class can work it out first); once shown, the value can be added to the formula.
 */
export function FormulaEditor() {
  const t = useT()
  const fe = useUI((s) => s.formulaEdit)
  const cam = useUI((s) => s.camera)
  const view = useUI((s) => s.view)
  const lang = useUI((s) => s.lang)
  const size = fe ? fe.size * cam.zoom : 0
  const rows: Row | null = fe?.rows ?? null
  const lay = useMemo(() => (rows ? typesetRows(rows, size, true) : null), [rows, size])
  const result = useMemo(() => (rows ? numericResult(rows, lang === 'uk') : null), [rows, lang])
  const shown = useMemo(
    () => (result ? typesetRows([{ t: 'c', s: result.approx ? '≈' : '=' }, ...result.atoms], Math.max(14, Math.min(size, 28)), false) : null),
    [result, size]
  )
  // The answer stays hidden until asked for, again for every formula edited and after it can't be worked out.
  const session = fe ? `${fe.id ?? 'new'}:${fe.x}:${fe.baseline}` : ''
  const [revealed, setRevealed] = useState('')
  const open = !!result && revealed === session
  useEffect(() => {
    if (!result && revealed) setRevealed('')
  }, [result, revealed])
  // A long formula grows past the window edge: keep the caret in sight by moving the board.
  const caret = fe && lay ? caretOf(lay, fe.cur) : undefined
  const caretX = fe && caret ? (fe.x - cam.x) * cam.zoom + caret.x : null
  useEffect(() => {
    if (caretX === null) return
    const edge = 48
    const over = caretX > window.innerWidth - edge ? caretX - (window.innerWidth - edge) : caretX < edge ? caretX - edge : 0
    if (over) editor.setCamera({ ...editor.camera, x: editor.camera.x + over / editor.camera.zoom })
  }, [caretX])
  if (!fe || !lay || view !== 'board') return null

  const value: FormulaState = { rows: fe.rows, cur: fe.cur }
  const set = (st: FormulaState): void => {
    const cur = useUI.getState().formulaEdit
    if (cur) useUI.setState({ formulaEdit: { ...cur, rows: st.rows, cur: st.cur } })
  }
  const accept = (): boolean => {
    if (!result) return false
    // Tab first shows the answer, a second Tab writes it.
    if (!open) {
      setRevealed(session)
      return true
    }
    // An approximate value is written with ≈ unless the formula already ends with =.
    const lead: Row = result.hasEq ? [] : [{ t: 'c', s: result.approx ? '≈' : '=' }]
    const next = [...fe.rows, ...lead, ...result.atoms]
    set({ rows: next, cur: { path: [], i: next.length } })
    return true
  }

  return (
    <div
      className="formula-editor"
      style={{ left: (fe.x - cam.x) * cam.zoom - PAD, top: (fe.baseline - cam.y) * cam.zoom - lay.box.asc - PAD, color: fe.color }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FormulaField
        value={value}
        onChange={set}
        size={size}
        pad={PAD}
        autoFocus
        fieldKey={session}
        onDone={() => editor.commitFormula()}
        onBlur={() => editor.commitFormula()}
        onTab={accept}
      />
      {result && !open && (
        <button
          className="formula-result formula-reveal"
          title={t('formula.showAnswerTitle')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setRevealed(session)}
        >
          {t('formula.showAnswer')}
        </button>
      )}
      {shown && open && (
        <button
          className="formula-result"
          title={t('formula.insertResult')}
          // Not a focus change: the formula keeps the caret.
          onPointerDown={(e) => e.preventDefault()}
          onClick={accept}
        >
          <MathSvg lay={shown} pad={2} holes={false} />
        </button>
      )}
    </div>
  )
}
