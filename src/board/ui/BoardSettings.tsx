import { useT } from '../i18n'
import { SNAP_DELAY, useUI, type WheelMode } from '../store'

/** Settings: what the mouse wheel does, and hold-to-snap shapes. */
export function BoardSettings() {
  const t = useT()
  const wheel = useUI((s) => s.wheelMode)
  const snap = useUI((s) => s.shapeSnap)
  const delay = useUI((s) => s.shapeSnapDelay)
  const lang = useUI((s) => s.lang)
  const seconds = (delay / 1000).toFixed(1)
  return (
    <>
      <div className="popover-title section">{t('settings.board')}</div>
      <div className="settings-label">{t('settings.wheel')}</div>
      <div className="lang-options">
        {(['scroll', 'zoom'] as WheelMode[]).map((m) => (
          <button key={m} className={`lang-option ${wheel === m ? 'active' : ''}`} onClick={() => useUI.setState({ wheelMode: m })}>
            {t(m === 'scroll' ? 'settings.wheelScroll' : 'settings.wheelZoom')}
          </button>
        ))}
      </div>
      <p className="settings-hint">{t('settings.wheelHint')}</p>
      <div className="feature-list">
        <label className="feature-row">
          <input type="checkbox" checked={snap} onChange={(e) => useUI.setState({ shapeSnap: e.target.checked })} />
          <span>
            <span className="feature-name">{t('settings.shapeSnap')}</span>
            <span className="feature-hint">{t('settings.shapeSnapHint')}</span>
          </span>
        </label>
      </div>
      {snap && (
        <div className="line-row size-row">
          <span className="line-label">{t('settings.shapeSnapDelay')}</span>
          <input
            type="range"
            min={SNAP_DELAY.min}
            max={SNAP_DELAY.max}
            step={100}
            value={delay}
            aria-label={t('settings.shapeSnapDelay')}
            onChange={(e) => useUI.setState({ shapeSnapDelay: Number(e.target.value) })}
          />
          <span className="size-value">{t('settings.seconds', { n: lang === 'uk' ? seconds.replace('.', ',') : seconds })}</span>
        </div>
      )}
    </>
  )
}
