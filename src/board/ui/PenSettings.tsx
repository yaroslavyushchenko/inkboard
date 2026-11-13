import { useState } from 'react'
import { useT, type MessageKey } from '../i18n'
import { useUI, type PenAction, type PenButtons } from '../store'
import { KeyboardIcon } from './icons'

const ACTIONS: PenAction[] = ['eraser', 'select', 'tool']
const BUTTONS: { key: keyof PenButtons; label: MessageKey }[] = [
  { key: 'lower', label: 'pen.lower' },
  { key: 'upper', label: 'pen.upper' },
  { key: 'eraserEnd', label: 'pen.eraserEnd' }
]

/** Settings section: what each pen button does, plus a live tester. */
export function PenSettings() {
  const t = useT()
  const penButtons = useUI((s) => s.penButtons)
  const setPenButton = useUI((s) => s.setPenButton)
  const [detected, setDetected] = useState<string | null>(null)
  const describe = (e: React.PointerEvent): string => {
    if (e.pointerType !== 'pen') return t('pen.notPen', { type: e.pointerType })
    if (e.button === 5 || (e.buttons & 32) !== 0) return t('pen.eraserEnd')
    if (e.button === 2 || (e.buttons & 2) !== 0) return t('pen.lower')
    if (e.button === 1 || (e.buttons & 4) !== 0) return t('pen.upper')
    return t('pen.tip')
  }
  return (
    <>
      <div className="popover-title section">{t('pen.title')}</div>
      <div className="pen-buttons">
        {BUTTONS.map((b) => (
          <label key={b.key} className="pen-row">
            <span>{t(b.label)}</span>
            <select value={penButtons[b.key]} onChange={(e) => setPenButton(b.key, e.target.value as PenAction)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`pen.action.${a}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div
        className="pen-tester"
        onPointerDown={(e) => {
          e.preventDefault()
          setDetected(describe(e))
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {detected ? t('pen.detected', { what: detected }) : t('pen.testHere')}
      </div>
      <button className="text-btn outline shortcuts-btn" onClick={() => useUI.setState({ shortcutsOpen: true })}>
        <KeyboardIcon width={18} height={18} /> {t('shortcuts.open')}
      </button>
    </>
  )
}
