import type { LineCap, LineDash } from '../engine/types'
import { useT, type MessageKey } from '../i18n'

export interface LineStyleValue {
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
}

const DASHES: (LineDash | undefined)[] = [undefined, 'dashed', 'dotted']
const CAPS: (LineCap | undefined)[] = [undefined, 'arrow', 'dot', 'circle', 'bar']

function DashPreview({ dash }: { dash?: LineDash }) {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden>
      <line
        x1="3"
        y1="7"
        x2="31"
        y2="7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={dash === 'dashed' ? '6 5' : dash === 'dotted' ? '0.1 5' : undefined}
      />
    </svg>
  )
}

/** Small line with the decoration at the right (end) or left (start) side. */
export function CapPreview({ cap, side }: { cap?: LineCap; side: 'start' | 'end' }) {
  const flip = side === 'start' ? 'scale(-1,1) translate(-34,0)' : undefined
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden>
      <g transform={flip}>
        <line x1="3" y1="8" x2={cap === 'arrow' ? 24 : 27} y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {cap === 'arrow' && <path d="M31 8L22 3.5V12.5Z" fill="currentColor" />}
        {cap === 'dot' && <circle cx="28" cy="8" r="3.4" fill="currentColor" />}
        {cap === 'circle' && <circle cx="28" cy="8" r="3.6" fill="#fff" stroke="currentColor" strokeWidth="1.6" />}
        {cap === 'bar' && <line x1="28" y1="2.5" x2="28" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </g>
    </svg>
  )
}

/** Line pattern + line ends picker (pen popover and the selection "Style" panel). */
export function LineStyleControls({
  value,
  onChange,
  showCaps
}: {
  value: LineStyleValue
  onChange: (patch: LineStyleValue) => void
  showCaps: boolean
}) {
  const t = useT()
  return (
    <div className="line-style">
      <div className="line-row">
        <span className="line-label">{t('line.pattern')}</span>
        <div className="seg small">
          {DASHES.map((d) => (
            <button
              key={d ?? 'solid'}
              className={value.dash === d ? 'active' : ''}
              title={t(`line.${d ?? 'solid'}` as MessageKey)}
              onClick={() => onChange({ dash: d })}
            >
              <DashPreview dash={d} />
            </button>
          ))}
        </div>
      </div>
      {showCaps && (
        <>
          {(['start', 'end'] as const).map((side) => {
            const current = side === 'start' ? value.startCap : value.endCap
            return (
              <div key={side} className="line-row">
                <span className="line-label">{t(side === 'start' ? 'line.start' : 'line.end')}</span>
                <div className="seg small">
                  {CAPS.map((c) => (
                    <button
                      key={c ?? 'none'}
                      className={current === c ? 'active' : ''}
                      title={t(`cap.${c ?? 'none'}` as MessageKey)}
                      onClick={() => onChange(side === 'start' ? { startCap: c } : { endCap: c })}
                    >
                      <CapPreview cap={c} side={side} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
