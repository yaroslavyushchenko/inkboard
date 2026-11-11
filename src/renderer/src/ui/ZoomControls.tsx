import { editor } from '../editor'
import { useT } from '../i18n'
import { useUI } from '../store'
import { MinusIcon, PlusIcon } from './icons'

export function ZoomControls() {
  const zoom = useUI((s) => s.zoom)
  const t = useT()
  return (
    <div className="panel zoom-controls">
      <button className="icon-btn" title={t('zoom.out')} onClick={() => editor.zoomStep(-1)}>
        <MinusIcon />
      </button>
      <button className="zoom-label" title={t('zoom.reset')} onClick={() => editor.resetZoom()}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="icon-btn" title={t('zoom.in')} onClick={() => editor.zoomStep(1)}>
        <PlusIcon />
      </button>
    </div>
  )
}
