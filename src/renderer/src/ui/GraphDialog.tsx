import { useEffect, useState } from 'react'
import { editor } from '../editor'
import { sanitizeGraph } from '../engine/graph'
import type { GraphParams } from '../engine/types'
import { useT } from '../i18n'
import { useUI } from '../store'

const UNIT_CHOICES = [24, 36, 48, 72]

/** Configure a coordinate line / plane: insert a new one, edit the selected one, or save a preset. */
export function GraphDialog() {
  const t = useT()
  const dialog = useUI((s) => s.graphDialog)
  const [p, setP] = useState<GraphParams | null>(null)
  const [presetName, setPresetName] = useState('')
  useEffect(() => {
    setP(dialog ? { ...dialog.params } : null)
    setPresetName('')
  }, [dialog])
  if (!dialog || !p) return null

  const close = (): void => {
    useUI.setState({ graphDialog: null })
  }
  const num = (key: keyof GraphParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP({ ...p, [key]: e.target.value === '' ? 0 : Number(e.target.value) })
  const apply = (): void => {
    const clean = sanitizeGraph(p)
    if (dialog.mode === 'edit' && dialog.id) editor.updateGraph(dialog.id, clean)
    else editor.insertGraph(clean)
    close()
  }
  const savePreset = (): void => {
    if (!presetName.trim()) return
    const preset = { id: `${Date.now().toString(36)}`, name: presetName.trim(), params: sanitizeGraph(p) }
    useUI.setState((s) => ({ graphPresets: [...s.graphPresets, preset] }))
    setPresetName('')
  }
  const isPlane = p.kind === 'plane' || p.kind === 'space'

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal graph-dialog" onKeyDown={(e) => e.code === 'Escape' && close()}>
        <h3>{t(dialog.mode === 'edit' ? 'graph.editTitle' : 'graph.customTitle')}</h3>

        <div className="seg">
          {(['line', 'plane', 'space'] as const).map((k) => (
            <button
              key={k}
              className={p.kind === k ? 'active' : ''}
              onClick={() => setP(k === 'space' && p.kind !== 'space' ? { ...p, kind: k, zMin: p.zMin ?? 0, zMax: p.zMax ?? Math.max(1, p.yMax) } : { ...p, kind: k })}
            >
              {t(k === 'line' ? 'graph.kindLine' : k === 'plane' ? 'graph.kindPlane' : 'graph.kindSpace')}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>{t('graph.xRange')}</label>
          <div className="range">
            <input type="number" value={p.xMin} onChange={num('xMin')} />
            <span>…</span>
            <input type="number" value={p.xMax} onChange={num('xMax')} />
          </div>
          {isPlane && (
            <>
              <label>{t('graph.yRange')}</label>
              <div className="range">
                <input type="number" value={p.yMin} onChange={num('yMin')} />
                <span>…</span>
                <input type="number" value={p.yMax} onChange={num('yMax')} />
              </div>
            </>
          )}
          {p.kind === 'space' && (
            <>
              <label>{t('graph.zRange')}</label>
              <div className="range">
                <input type="number" value={p.zMin ?? 0} onChange={num('zMin')} />
                <span>…</span>
                <input type="number" value={p.zMax ?? 5} onChange={num('zMax')} />
              </div>
            </>
          )}
          <label>{t('graph.unit')}</label>
          <div className="seg small">
            {UNIT_CHOICES.map((u) => (
              <button key={u} className={p.unit === u ? 'active' : ''} onClick={() => setP({ ...p, unit: u })}>
                {u / 24 === 1 ? '1' : u / 24}
                {t('graph.cells')}
              </button>
            ))}
          </div>
          <label>{t('graph.labelStep')}</label>
          <div className="seg small">
            {[1, 2, 5, 10].map((n) => (
              <button key={n} className={p.labelStep === n ? 'active' : ''} onClick={() => setP({ ...p, labelStep: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="preset-save">
          <input value={presetName} placeholder={t('graph.presetName')} onChange={(e) => setPresetName(e.target.value)} />
          <button className="text-btn outline" disabled={!presetName.trim()} onClick={savePreset}>
            {t('graph.savePreset')}
          </button>
        </div>

        <div className="modal-actions">
          <button className="text-btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="text-btn primary" onClick={apply}>
            {t(dialog.mode === 'edit' ? 'graph.apply' : 'graph.insert')}
          </button>
        </div>
      </div>
    </div>
  )
}
