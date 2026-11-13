import { useCallback, useState, type ReactNode } from 'react'
import { BACKGROUND_STYLE, CHALK_PATTERN_COLOR } from '../engine/background'
import { bgPattern, CHALKBOARD_COLOR, isChalk, withPattern, withSurface } from '../engine/surface'
import type { PaperPattern } from '../engine/types'
import { useFeature } from '../features'
import { LANGUAGES, useT, type Lang, type MessageKey } from '../i18n'
import { useUI } from '../store'
import { PaperIcon } from './icons'
import { PenSettings } from './PenSettings'
import { ExperimentalSettings, ThemeSettings } from './ExperimentalSettings'
import { Popover } from './Popover'

const OPTIONS: { kind: PaperPattern; label: MessageKey }[] = [
  { kind: 'blank', label: 'bg.blank' },
  { kind: 'dots', label: 'bg.dots' },
  { kind: 'grid', label: 'bg.grid' },
  { kind: 'lines', label: 'bg.lines' }
]

function Preview({ kind, chalk }: { kind: PaperPattern; chalk: boolean }) {
  const cells = [10, 22, 34, 46]
  const ink = (p: keyof typeof BACKGROUND_STYLE, paper: string): string => (chalk ? CHALK_PATTERN_COLOR[p] : paper)
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <rect width="56" height="56" rx="6" fill={chalk ? CHALKBOARD_COLOR : '#fff'} />
      {kind === 'dots' && cells.map((y) => cells.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={ink('dots', '#a9acb5')} />))}
      {kind === 'grid' &&
        cells.map((v) => (
          <g key={v} stroke={ink('grid', '#d5d8e0')}>
            <line x1={v} y1="0" x2={v} y2="56" />
            <line x1="0" y1={v} x2="56" y2={v} />
          </g>
        ))}
      {kind === 'lines' && cells.map((v) => <line key={v} x1="0" y1={v} x2="56" y2={v} stroke={ink('lines', '#cdd3dd')} />)}
    </svg>
  )
}

/** Top-right board settings: paper background and UI language. */
export function BackgroundPicker({
  storageSettings, about, fixedLanguage, surfaceFollowsTheme
}: { storageSettings?: ReactNode; about?: ReactNode; fixedLanguage?: boolean; surfaceFollowsTheme: boolean }) {
  const { background, lang, setBackground, setLang } = useUI()
  const chalkFlag = useFeature('chalkboard')
  const chalk = isChalk(background)
  const pattern = bgPattern(background)
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
          {/* Shown while the flag is on, or to switch a chalkboard back to paper after it was turned off. */}
          {!surfaceFollowsTheme && (chalkFlag || chalk) && (
            <div className="lang-options surface-options">
              {[false, true].map((c) => (
                <button key={String(c)} className={`lang-option ${chalk === c ? 'active' : ''}`} onClick={() => setBackground(withSurface(background, c))}>
                  {t(c ? 'surface.chalkboard' : 'surface.paper')}
                </button>
              ))}
            </div>
          )}
          <div className="bg-options">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                className={`bg-option ${pattern === o.kind ? 'active' : ''}`}
                onClick={() => setBackground(withPattern(background, o.kind))}
              >
                <Preview kind={o.kind} chalk={chalk} />
                <span>{t(o.label)}</span>
              </button>
            ))}
          </div>
          {!fixedLanguage && (
            <>
              <div className="popover-title section">{t('settings.language')}</div>
              <div className="lang-options">
                {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
                  <button key={l} className={`lang-option ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
                    {LANGUAGES[l]}
                  </button>
                ))}
              </div>
            </>
          )}
          {storageSettings}
          <ThemeSettings />
          <PenSettings />
          {!surfaceFollowsTheme && <ExperimentalSettings />}
          {about}
        </Popover>
      )}
    </div>
  )
}
