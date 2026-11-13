import { FEATURE_IDS } from '../../../shared/features'
import { useFeatures } from '../features'
import { useT, type MessageKey } from '../i18n'
import { useUI, type ThemePref } from '../store'

const THEMES: ThemePref[] = ['system', 'light', 'dark']

/** Settings: interface theme (only while the dark theme flag is on). */
export function ThemeSettings() {
  const t = useT()
  const enabled = useFeatures((s) => s.flags.darkTheme)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  if (!enabled) return null
  return (
    <>
      <div className="popover-title section">{t('settings.theme')}</div>
      <div className="lang-options">
        {THEMES.map((th) => (
          <button key={th} className={`lang-option ${theme === th ? 'active' : ''}`} onClick={() => setTheme(th)}>
            {t(`theme.${th}` as MessageKey)}
          </button>
        ))}
      </div>
    </>
  )
}

/** Settings: switches for the feature flags in src/shared/features.ts. */
export function ExperimentalSettings() {
  const t = useT()
  const flags = useFeatures((s) => s.flags)
  const setFlag = useFeatures((s) => s.set)
  return (
    <>
      <div className="popover-title section">{t('settings.experimental')}</div>
      <p className="settings-hint">{t('settings.experimentalHint')}</p>
      <div className="feature-list">
        {FEATURE_IDS.map((id) => (
          <label key={id} className="feature-row">
            <input type="checkbox" checked={flags[id]} onChange={(e) => void setFlag(id, e.target.checked)} />
            <span>
              <span className="feature-name">{t(`feature.${id}` as MessageKey)}</span>
              <span className="feature-hint">{t(`feature.${id}.hint` as MessageKey)}</span>
            </span>
          </label>
        ))}
      </div>
    </>
  )
}
