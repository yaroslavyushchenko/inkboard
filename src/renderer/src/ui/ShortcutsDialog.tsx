import { useT, type MessageKey } from '../i18n'
import { useUI } from '../store'

const GROUPS: { title: MessageKey; rows: [string, MessageKey][] }[] = [
  {
    title: 'shortcuts.tools',
    rows: [
      ['1 / 2 / 3', 'shortcuts.pens'],
      ['P', 'shortcuts.pen'],
      ['H', 'shortcuts.highlighter'],
      ['E', 'shortcuts.eraser'],
      ['X', 'shortcuts.swap'],
      ['V', 'shortcuts.lasso'],
      ['M', 'shortcuts.move'],
      ['Space', 'shortcuts.pan']
    ]
  },
  {
    title: 'shortcuts.editing',
    rows: [
      ['Ctrl+Z', 'shortcuts.undo'],
      ['Ctrl+Y', 'shortcuts.redo'],
      ['Shift', 'shortcuts.straight'],
      ['Ctrl+G', 'shortcuts.group'],
      ['Ctrl+Shift+G', 'shortcuts.ungroup'],
      ['Ctrl+D', 'shortcuts.duplicate'],
      ['Del', 'shortcuts.delete'],
      ['Ctrl+A', 'shortcuts.selectAll'],
      ['Ctrl+C / Ctrl+V', 'shortcuts.copyPaste']
    ]
  },
  {
    title: 'shortcuts.view',
    rows: [
      ['Ctrl + / Ctrl −', 'shortcuts.zoom'],
      ['Ctrl+0', 'shortcuts.zoomReset'],
      ['Ctrl+H', 'shortcuts.home'],
      ['Ctrl+N', 'shortcuts.new'],
      ['Ctrl+O', 'shortcuts.open'],
      ['Ctrl+S', 'shortcuts.save']
    ]
  }
]

/** All keyboard shortcuts + how to put them on Wacom ExpressKeys. */
export function ShortcutsDialog() {
  const t = useT()
  const open = useUI((s) => s.shortcutsOpen)
  if (!open) return null
  const close = (): void => {
    useUI.setState({ shortcutsOpen: false })
  }
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal shortcuts-dialog">
        <h3>{t('shortcuts.title')}</h3>
        <div className="shortcuts-cols">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="popover-title">{t(g.title)}</div>
              {g.rows.map(([keys, label]) => (
                <div key={keys} className="shortcut-row">
                  <kbd>{keys}</kbd>
                  <span>{t(label)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="wacom-guide">
          <div className="popover-title">{t('wacom.title')}</div>
          <p>{t('wacom.intro')}</p>
          <ol>
            <li>{t('wacom.step1')}</li>
            <li>{t('wacom.step2')}</li>
            <li>{t('wacom.step3')}</li>
          </ol>
          <p>{t('wacom.suggest')}</p>
          <p className="muted">{t('wacom.pen')}</p>
        </div>
        <div className="modal-actions">
          <button className="text-btn primary" onClick={close}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
