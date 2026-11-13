import { useEffect, useMemo, useRef, useState } from 'react'
import {
  backspace, insertFraction, moveEnd, moveHome, moveLeft, moveRight, typeChar, type Cursor, type FormulaState
} from '@inkboard/math/formula'
import { caretAt, caretOf, caretVertical, typesetRows } from '../engine/formulatype'
import { type MathTarget, prefsStore } from '../store'
import { divSign } from './mathKeys'
import { MathSvg } from './MathSvg'
import { useEditor } from '../editorContext'

/** Latin letter of a physical key, so formulas can be typed while a Cyrillic layout is on. */
const latinOf = (code: string): string | null => (/^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : null)

/**
 * An editable formula: draws it, shows the caret, takes typing, and offers itself to the math
 * keypad while it has the focus. The value lives with the caller (`value` / `onChange`).
 */
export function FormulaField({
  value,
  onChange,
  size,
  pad = 6,
  plot = false,
  autoFocus,
  className,
  errorAt,
  onDone,
  onCancel,
  onTab,
  onBlur,
  fieldKey
}: {
  value: FormulaState
  onChange: (st: FormulaState) => void
  /** Font size in screen pixels. */
  size: number
  pad?: number
  /** A function of x for a plot (the keypad opens accordingly). */
  plot?: boolean
  autoFocus?: boolean
  className?: string
  /** Where the calculator stopped: marked in red. */
  errorAt?: Cursor
  onDone?: () => void
  onCancel?: () => void
  /** Tab pressed; return true if it was used. */
  onTab?: () => boolean
  /** The focus really left (the math keypad never takes it). */
  onBlur?: () => void
  /** Changes when the field starts on another formula: focus again, forget the undo steps. */
  fieldKey?: string | number
}) {
  const editor = useEditor()
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const lay = useMemo(() => typesetRows(value.rows, size, true), [value.rows, size])
  const caret = caretOf(lay, value.cur)
  const err = errorAt ? caretOf(lay, errorAt) : undefined

  // The newest props for handlers that outlive a render (the keypad holds on to them).
  const live = useRef({ value, onChange, onDone, lay })
  live.current = { value, onChange, onDone, lay }
  /** States before each change, for Ctrl+Z inside the field. */
  const undo = useRef<FormulaState[]>([])
  const redo = useRef<FormulaState[]>([])

  const change = (next: FormulaState): void => {
    const cur = live.current.value
    if (next === cur) return
    if (next.rows !== cur.rows) {
      undo.current.push(cur)
      if (undo.current.length > 200) undo.current.shift()
      redo.current = []
    }
    live.current.value = next
    live.current.onChange(next)
  }

  const target = useRef<MathTarget | null>(null)
  target.current ??= {
    apply: (f) => change(f(live.current.value)),
    get: () => live.current.value,
    done: () => live.current.onDone?.(),
    plot
  }

  useEffect(() => {
    undo.current = []
    redo.current = []
    if (autoFocus) ref.current?.focus()
    // Already focused (the effect ran before, or the browser kept the focus): no focus event comes.
    if (document.activeElement === ref.current) editor.session.setState({ mathTarget: target.current })
    return () => {
      if (editor.session.getState().mathTarget === target.current) editor.session.setState({ mathTarget: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey])

  const step = (from: FormulaState[], to: FormulaState[]): void => {
    const prev = from.pop()
    if (!prev) return
    to.push(live.current.value)
    live.current.value = prev
    live.current.onChange(prev)
  }

  return (
    <div
      ref={ref}
      className={`formula-field ${focused ? 'focused' : ''} ${className ?? ''}`}
      tabIndex={0}
      onFocus={() => {
        setFocused(true)
        editor.session.setState({ mathTarget: target.current })
      }}
      onBlur={() => {
        setFocused(false)
        if (editor.session.getState().mathTarget === target.current) editor.session.setState({ mathTarget: null })
        onBlur?.()
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        const svg = e.currentTarget.querySelector('svg')
        if (!svg) return
        const r = svg.getBoundingClientRect()
        const cur = caretAt(lay, e.clientX - r.left - pad, e.clientY - r.top - pad - lay.box.asc)
        if (cur) change({ rows: value.rows, cur })
      }}
      onPaste={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ').slice(0, 200)
        change([...text].reduce(typeChar, live.current.value))
      }}
      onKeyDown={(e) => {
        // Nothing typed here is a board shortcut.
        e.stopPropagation()
        const st = live.current.value
        const mod = e.ctrlKey || e.metaKey
        if (mod) {
          if (e.code === 'KeyZ' || e.code === 'KeyY') {
            e.preventDefault()
            if (e.code === 'KeyY' || e.shiftKey) step(redo.current, undo.current)
            else step(undo.current, redo.current)
          }
          return
        }
        const go = (next: FormulaState): void => {
          e.preventDefault()
          change(next)
        }
        switch (e.code) {
          case 'ArrowLeft':
            return go(moveLeft(st))
          case 'ArrowRight':
            return go(moveRight(st))
          case 'ArrowUp':
          case 'ArrowDown': {
            const cur = caretVertical(live.current.lay, st.cur, e.code === 'ArrowUp' ? -1 : 1)
            e.preventDefault()
            if (cur) change({ rows: st.rows, cur })
            return
          }
          case 'Home':
            return go(moveHome(st))
          case 'End':
            return go(moveEnd(st))
          case 'Backspace':
            return go(backspace(st))
          case 'Delete': {
            const next = moveRight(st)
            return go(next === st ? st : backspace(next))
          }
          case 'Enter':
          case 'NumpadEnter':
            e.preventDefault()
            return onDone?.()
          case 'Escape':
            e.preventDefault()
            return (onCancel ?? onDone)?.()
          case 'Tab':
            if (onTab?.()) e.preventDefault()
            return
        }
        // `/` is plain division, as on a calculator; Alt+/ makes a fraction of what stands before it.
        if (e.code === 'Slash' && e.altKey) return go(insertFraction(st))
        if (e.key.length !== 1 || e.altKey) return
        if (e.key === '/') return go(typeChar(st, divSign(prefsStore.getState().lang)))
        // A Cyrillic layout types Cyrillic letters: take the Latin letter of the same key instead.
        const ch = /\p{Script=Cyrillic}/u.test(e.key) ? latinOf(e.code) : e.key
        if (ch) go(typeChar(st, ch))
      }}
    >
      <MathSvg lay={lay} pad={pad}>
        {err && <line className="formula-error" x1={err.x - size * 0.25} x2={err.x + size * 0.25} y1={err.y + err.desc + 2} y2={err.y + err.desc + 2} />}
        {focused && caret && <line className="formula-caret" x1={caret.x} x2={caret.x} y1={caret.y - caret.asc} y2={caret.y + caret.desc} strokeWidth={Math.max(1.2, size * 0.05)} />}
      </MathSvg>
    </div>
  )
}
