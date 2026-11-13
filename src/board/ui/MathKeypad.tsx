import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { backspace, insert, insertFraction, moveLeft, moveRight, typeChar, type FormulaState, type Row } from '@inkboard/math/formula'
import { typesetRows } from '../engine/formulatype'
import { useT, type MessageKey } from '../i18n'
import { usePrefs } from '../store'
import { fitBox, screenArea } from './dock'
import { MathSvg } from './MathSvg'
import { keypadLayout, letterKeys, type KeypadTab, type MathKey } from './mathKeys'
import { useSession } from '../editorContext'

const TABS: { id: KeypadTab; lines: [string, string]; title: MessageKey }[] = [
  { id: 'basic', lines: ['+ −', '× ÷'], title: 'keypad.tabBasic' },
  { id: 'func', lines: ['f(x) e', 'log ln'], title: 'keypad.tabFunc' },
  { id: 'trig', lines: ['sin cos', 'tan cot'], title: 'keypad.tabTrig' },
  { id: 'calc', lines: ['lim dx', '∫ Σ ∞'], title: 'keypad.tabCalc' }
]

const HOLD_MS = 350

const press = (key: MathKey) => (st: FormulaState): FormulaState =>
  key.act.k === 'type' ? [...key.act.s].reduce(typeChar, st) : key.act.k === 'frac' ? insertFraction(st) : insert(st, key.act.atoms)

/** What a key shows: its little formula, scaled down when it is a tall one (a matrix, a sum). */
function Face({ rows, w = 46, h = 30, size = 18 }: { rows: Row; w?: number; h?: number; size?: number }) {
  const lay = useMemo(() => typesetRows(rows, size, true), [rows, size])
  return <MathSvg lay={lay} pad={1} fit={{ w, h }} />
}

interface More {
  keys: MathKey[]
  left: number
  top: number
}

/**
 * The on-screen math keyboard, shown while a formula field has the focus. It never takes the focus
 * itself (every press is cancelled before the browser moves it), so typing on the real keyboard
 * and tapping keys here mix freely.
 */
export function MathKeypad() {
  const t = useT()
  const target = useSession((s) => s.mathTarget)
  const active = useSession((s) => s.active)
  const lang = usePrefs((s) => s.lang)
  const history = usePrefs((s) => s.formulaHistory)
  const [tab, setTab] = useState<KeypadTab>('basic')
  const [letters, setLetters] = useState(false)
  const [more, setMore] = useState<More | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const hold = useRef<{ timer: number; opened: boolean } | null>(null)
  const repeat = useRef(0)

  const open = !!target && active
  useEffect(() => {
    if (!open) {
      setMore(null)
      setShowHistory(false)
      window.clearInterval(repeat.current)
    }
  }, [open])
  // A press anywhere but on the extra keys puts them away.
  useEffect(() => {
    if (!more) return
    const down = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement).closest?.('.keypad-more')) setMore(null)
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [more])

  const layout = useMemo(() => (letters ? letterKeys() : keypadLayout(tab, lang)), [letters, tab, lang])
  if (!open || !target) return null

  const run = (key: MathKey): void => target.apply(press(key))

  const showMore = (key: MathKey, el: HTMLElement): void => {
    if (!key.more) return
    const r = el.getBoundingClientRect()
    const w = key.more.length * 48 + 8
    const f = fitBox(r, w, 52, screenArea(), 'above', 4)
    setMore({ keys: key.more, left: f.left, top: f.top })
  }

  const keyProps = (key: MathKey) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      const el = e.currentTarget
      const h = { timer: 0, opened: false }
      hold.current = h
      if (key.more) {
        h.timer = window.setTimeout(() => {
          h.opened = true
          showMore(key, el)
        }, HOLD_MS)
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      const h = hold.current
      hold.current = null
      if (!h) return
      window.clearTimeout(h.timer)
      if (!h.opened) return run(key)
      // Held, slid onto one of the extra keys and let go: that key is typed.
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-more]')
      const picked = over && key.more?.[Number(over.dataset.more)]
      if (picked) {
        run(picked)
        setMore(null)
      }
    },
    onPointerCancel: () => {
      if (hold.current) window.clearTimeout(hold.current.timer)
      hold.current = null
    },
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      showMore(key, e.currentTarget)
    }
  })

  const stopRepeat = (): void => window.clearInterval(repeat.current)
  const startRepeat = (f: (st: FormulaState) => FormulaState): void => {
    target.apply(f)
    stopRepeat()
    let waited = 0
    repeat.current = window.setInterval(() => {
      // A short pause first, then quickly, like a held key.
      if ((waited += 70) > 350) target.apply(f)
    }, 70)
  }
  const held = (f: (st: FormulaState) => FormulaState) => ({
    onPointerDown: (e: React.PointerEvent) => e.button === 0 && startRepeat(f),
    onPointerUp: stopRepeat,
    onPointerLeave: stopRepeat,
    onPointerCancel: stopRepeat
  })

  return (
    <div
      className="panel math-keypad"
      // Keep the focus (and the caret) in the formula.
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showHistory && (
        <div className="panel keypad-history">
          {history.length === 0 && <p className="settings-hint">{t('keypad.historyEmpty')}</p>}
          {history.map((rows, i) => (
            <button
              key={i}
              className="keypad-history-item"
              onClick={() => {
                target.apply((st) => insert(st, rows))
                setShowHistory(false)
              }}
            >
              <Face rows={rows} w={380} h={44} size={20} />
            </button>
          ))}
        </div>
      )}
      <div className="keypad-top">
        <button className={`keypad-key flat ${letters ? 'active' : ''}`} title={t(letters ? 'keypad.numbers' : 'keypad.letters')} onClick={() => setLetters((v) => !v)}>
          {letters ? '123' : 'abc'}
        </button>
        <button className={`keypad-key flat ${showHistory ? 'active' : ''}`} title={t('keypad.history')} onClick={() => setShowHistory((v) => !v)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2" />
          </svg>
        </button>
        <button className="keypad-key flat" title={t('keypad.left')} {...held(moveLeft)}>
          ←
        </button>
        <button className="keypad-key flat" title={t('keypad.right')} {...held(moveRight)}>
          →
        </button>
        <button className="keypad-key flat" title={t('keypad.done')} onClick={() => target.done()}>
          ↵
        </button>
        <button className="keypad-key flat" title={t('keypad.backspace')} {...held(backspace)}>
          ⌫
        </button>
      </div>
      <div className="keypad-tabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`keypad-tab ${!letters && tab === tb.id ? 'active' : ''}`}
            title={t(tb.title)}
            onClick={() => {
              setTab(tb.id)
              setLetters(false)
            }}
          >
            <span>{tb.lines[0]}</span>
            <span>{tb.lines[1]}</span>
          </button>
        ))}
      </div>
      <div className="keypad-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}>
        {layout.keys.map((key, i) => (
          <button
            key={`${letters ? 'abc' : tab}${i}`}
            className={`keypad-key ${key.tone === 'num' ? 'num' : ''}`}
            title={key.more ? t('keypad.more') : undefined}
            {...keyProps(key)}
          >
            <Face rows={key.face} w={layout.cols > 6 ? 34 : 50} />
            {key.more && <i className="keypad-dot" />}
          </button>
        ))}
      </div>
      {/* On the page itself: the keypad is shifted with a transform, which would carry a fixed box along. */}
      {more && createPortal(
        <div
          className="panel keypad-more"
          style={{ left: more.left, top: more.top }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {more.keys.map((key, i) => (
            <button
              key={i}
              data-more={i}
              className="keypad-key"
              onPointerUp={() => {
                // A slide from the held key ends on that key's own handler; this is a plain tap.
                if (hold.current) return
                run(key)
                setMore(null)
              }}
            >
              <Face rows={key.face} w={40} />
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
