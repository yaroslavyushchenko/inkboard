import { useCallback, useState } from 'react'
import type { BackgroundKind } from '../engine/types'
import { editor } from '../editor'
import { LANGUAGES, useT, type Lang, type MessageKey } from '../i18n'
import { platform } from '../platform'
import { useUI } from '../store'
import { PaperIcon } from './icons'
import { AboutSection } from './UpdateBanner'
import { Popover } from './Popover'

const OPTIONS: { kind: BackgroundKind; label: MessageKey }[] = [
  { kind: 'blank', label: 'bg.blank' },
  { kind: 'dots', label: 'bg.dots' },
  { kind: 'grid', label: 'bg.grid' },
  { kind: 'lines', label: 'bg.lines' }
]

function Preview({ kind }: { kind: BackgroundKind }) {
  const cells = [10, 22, 34, 46]
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <rect width="56" height="56" rx="6" fill="#fff" />
      {kind === 'dots' && cells.map((y) => cells.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#a9acb5" />))}
      {kind === 'grid' &&
        cells.map((v) => (
          <g key={v} stroke="#d5d8e0">
            <line x1={v} y1="0" x2={v} y2="56" />
            <line x1="0" y1={v} x2="56" y2={v} />
          </g>
        ))}
      {kind === 'lines' && cells.map((v) => <line key={v} x1="0" y1={v} x2="56" y2={v} stroke="#cdd3dd" />)}
    </svg>
  )
}

/** Top-right board settings: paper background and UI language. */
export function BackgroundPicker() {
  const { background, lang, setBackground, setLang } = useUI()
  const backupDir = useUI((s) => s.library.backupDir)
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="bg-picker">
      <button data-popover-anchor className="panel icon-btn solo" title={t('settings.title')} onClick={() => setOpen((o) => !o)}>
        <PaperIcon />
      </button>
      {open && (
        <Popover onClose={close} className="bg-popover">
          <div className="popover-title">{t('settings.background')}</div>
          <div className="bg-options">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                className={`bg-option ${background === o.kind ? 'active' : ''}`}
                onClick={() => setBackground(o.kind)}
              >
                <Preview kind={o.kind} />
                <span>{t(o.label)}</span>
              </button>
            ))}
          </div>
          <div className="popover-title section">{t('settings.language')}</div>
          <div className="lang-options">
            {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
              <button key={l} className={`lang-option ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
                {LANGUAGES[l]}
              </button>
            ))}
          </div>
          {platform.capabilities.backup && (
            <>
              <div className="popover-title section">{t('settings.backup')}</div>
              <p className="settings-hint">{t('settings.backupHint')}</p>
              <div className="backup-row">
                <span className="backup-path" title={backupDir ?? undefined}>
                  {backupDir ?? t('settings.backupOff')}
                </span>
                <button className="text-btn outline" onClick={() => void editor.chooseBackupDir()}>
                  {t(backupDir ? 'settings.backupChange' : 'settings.backupChoose')}
                </button>
                {backupDir && (
                  <button className="text-btn" onClick={() => void editor.disableBackup()}>
                    {t('settings.backupDisable')}
                  </button>
                )}
              </div>
            </>
          )}
          <AboutSection />
        </Popover>
      )}
    </div>
  )
}
