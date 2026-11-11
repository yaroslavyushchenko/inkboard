import { useT } from '../i18n'
import { useUI } from '../store'

/**
 * How to use the protractor / compass, shown at the bottom while one is on the board, until the
 * user closes it ("Got it" is remembered).
 */
export function InstrumentTip() {
  const t = useT()
  const prot = useUI((s) => s.protractor !== null)
  const comp = useUI((s) => s.compass !== null)
  const hidden = useUI((s) => s.hiddenTips)
  const which = comp && !hidden.includes('compass') ? 'compass' : prot && !hidden.includes('protractor') ? 'protractor' : null
  if (!which) return null
  return (
    <div className="panel instrument-tip" onPointerDown={(e) => e.stopPropagation()}>
      <span>{t(which === 'compass' ? 'tip.compass' : 'tip.protractor')}</span>
      <button className="text-btn" onClick={() => useUI.setState((s) => ({ hiddenTips: [...s.hiddenTips, which] }))}>
        {t('tip.hide')}
      </button>
    </div>
  )
}
