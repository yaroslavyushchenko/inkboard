import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PROT_STEPS } from '../engine/instruments'
import { useT } from '../i18n'
import { usePrefs, prefsStore } from '../store'
import { dockBeside } from './dock'
import { useEditor, useSession } from '../editorContext'

const PANEL_W = 300

/** The protractor's settings card (opened with its ⚙ handle): which angles it snaps to. Not modal. */
export function InstrumentPanel() {
  const editor = useEditor()
  const t = useT()
  const open = useSession((s) => s.protractorPanel)
  const prot = useSession((s) => s.protractor)
  const step = usePrefs((s) => s.instruments.protStep)
  const active = useSession((s) => s.active)
  useSession((s) => s.camera)
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(120)

  // The card goes away with the protractor.
  useEffect(() => {
    if (open && !prot) editor.session.setState({ protractorPanel: false })
  }, [open, prot])
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight)
  })

  if (!open || !prot || !active) return null
  const pad = 48 / editor.camera.zoom
  const box = { minX: prot.x - prot.r - pad, minY: prot.y - prot.r, maxX: prot.x + prot.r + pad, maxY: prot.y + prot.r }
  const { left, top } = dockBeside(box, editor.camera, PANEL_W, height)
  const close = (): void => {
    editor.session.setState({ protractorPanel: false })
  }

  return (
    <div
      ref={ref}
      className="panel fn-panel ins-panel"
      style={{ left, top, width: PANEL_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.code === 'Escape') close()
      }}
    >
      <div className="fn-panel-head">
        <span className="fn-title">{t('instruments.protractor')}</span>
        <button className="text-btn" title={t('common.close')} onClick={close}>
          ✕
        </button>
      </div>
      <div className="ins-row">
        <span>{t('instruments.snap')}</span>
        <div className="lang-options">
          {PROT_STEPS.map((v) => (
            <button
              key={v}
              className={`lang-option ${step === v ? 'active' : ''}`}
              onClick={() => prefsStore.setState((s) => ({ instruments: { ...s.instruments, protStep: v } }))}
            >
              {v === 0 ? t('instruments.off') : `${v}°`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
