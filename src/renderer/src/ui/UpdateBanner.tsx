import { useEffect, useState } from 'react'
import { useUI } from '../../../board/store'
import { boardLibrary } from '../boardLibrary'
import { useT } from '../../../board/i18n'
import type { UpdateState } from '../../../shared/platform'
import { platform } from '../platform'

/** Bottom-left notice when a new version is downloading / ready / available. */
export function UpdateBanner() {
  const t = useT()
  const [s, setS] = useState<UpdateState>({ status: 'idle' })
  const [hidden, setHidden] = useState<string | null>(null)
  useEffect(() => {
    void platform.update.getState().then(setS)
    platform.update.onState(setS)
  }, [])
  const key = `${s.status}:${s.version}`
  // "Updated to X": shown once after the app starts with a new version.
  const justUpdated = useUI((st) => st.justUpdatedTo)
  if (justUpdated && hidden !== `updated:${justUpdated}`) {
    return (
      <div className="panel update-banner success">
        <span>{t('update.updated', { version: justUpdated })}</span>
        <button className="text-btn" onClick={() => void platform.update.openDownload()}>
          {t('update.whatsNew')}
        </button>
        <button className="text-btn" onClick={() => setHidden(`updated:${justUpdated}`)}>
          {t('common.close')}
        </button>
      </div>
    )
  }
  if (hidden === key) return null
  if (s.status === 'downloading') {
    return (
      <div className="panel update-banner">
        <span className="save-spinner" />
        <span>
          {t('update.downloading', { version: s.version ?? '' })} {s.percent ?? 0}%
        </span>
      </div>
    )
  }
  if (s.status === 'ready') {
    return (
      <div className="panel update-banner">
        <span>{t('update.ready', { version: s.version ?? '' })}</span>
        <button className="text-btn" onClick={() => setHidden(key)}>
          {t('update.later')}
        </button>
        <button
          className="text-btn primary"
          onClick={async () => {
            await boardLibrary.flush(true)
            await platform.update.install()
          }}
        >
          {t('update.restart')}
        </button>
      </div>
    )
  }
  if (s.status === 'available' && s.manual) {
    return (
      <div className="panel update-banner">
        <span>{t('update.available', { version: s.version ?? '' })}</span>
        <button className="text-btn" onClick={() => setHidden(key)}>
          {t('update.later')}
        </button>
        <button className="text-btn primary" onClick={() => void platform.update.openDownload()}>
          {t('update.download')}
        </button>
      </div>
    )
  }
  return null
}

/** "About" block for the settings popover: version + manual check. */
export function AboutSection() {
  const t = useT()
  const [version, setVersion] = useState('')
  const [s, setS] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    void platform.update.version().then(setVersion)
    void platform.update.getState().then(setS)
    platform.update.onState(setS)
  }, [])
  const status =
    s.status === 'dev'
      ? t('update.dev')
      : s.status === 'store'
      ? t('update.store')
      : s.status === 'checking'
      ? t('update.checking')
      : s.status === 'none'
        ? t('update.upToDate')
        : s.status === 'downloading'
          ? `${t('update.downloading', { version: s.version ?? '' })} ${s.percent ?? 0}%`
          : s.status === 'ready'
            ? t('update.ready', { version: s.version ?? '' })
            : s.status === 'available'
              ? t('update.available', { version: s.version ?? '' })
              : s.status === 'error'
                ? t('update.error')
                : ''
  return (
    <>
      <div className="popover-title section">{t('settings.about')}</div>
      <div className="about-row">
        <span className="about-version">Inkboard {version}</span>
        {s.status !== 'store' && (
        <button className="text-btn outline" disabled={s.status === 'checking' || s.status === 'downloading'} onClick={() => void platform.update.check()}>
          {t('update.check')}
        </button>
        )}
      </div>
      {status && <p className="settings-hint">{status}</p>}
    </>
  )
}
