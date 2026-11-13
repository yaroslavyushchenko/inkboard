import { useT } from '../i18n'
import { MinusIcon, PlusIcon } from './icons'
import { useEditor, useSession } from '../editorContext'

export function ZoomControls() {
  const editor = useEditor()
  const zoom = useSession((s) => s.zoom)
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
