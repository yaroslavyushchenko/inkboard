import { useT, type MessageKey } from '../i18n'
import { CLIPBOARD_KEYS, HOLD_KEYS, SHORTCUTS, isBoardFileShortcut, type ShortcutGroup } from '../shortcuts'
import { useEditor, useSession } from '../editorContext'

const GROUPS: { id: ShortcutGroup; title: MessageKey }[] = [
  { id: 'tools', title: 'shortcuts.tools' },
  { id: 'editing', title: 'shortcuts.editing' },
  { id: 'view', title: 'shortcuts.view' }
]

/** All keyboard shortcuts (read from shortcuts.ts) + how to put them on Wacom ExpressKeys. */
export function ShortcutsDialog({ fileActions }: { fileActions: boolean }) {
  const editor = useEditor()
  const t = useT()
  const open = useSession((s) => s.shortcutsOpen)
  if (!open) return null
  const close = (): void => {
    editor.session.setState({ shortcutsOpen: false })
  }
  const rows = (g: ShortcutGroup): { display: string; label: string }[] => [
    ...SHORTCUTS.filter((s) => s.group === g && !s.alias && (fileActions || !isBoardFileShortcut(s.id))).map((s) => {
      // Show alternative bindings of the same action on one line (e.g. Ctrl+Y / Ctrl+Shift+Z).
      const alt = SHORTCUTS.filter((a) => a.alias && a.id === s.id && a.display !== s.display).map((a) => a.display)
      return { display: [s.display, ...alt].join(' / '), label: s.label }
    }),
    ...HOLD_KEYS.filter((h) => h.group === g),
    ...(g === 'editing' ? [{ display: t('shortcuts.mouseBack'), label: 'shortcuts.undo' }, { display: t('shortcuts.mouseForward'), label: 'shortcuts.redo' }] : []),
    ...(CLIPBOARD_KEYS.group === g ? [CLIPBOARD_KEYS] : [])
  ]
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal shortcuts-dialog">
        <h3>{t('shortcuts.title')}</h3>
        <div className="shortcuts-cols">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <div className="popover-title">{t(g.title)}</div>
              {rows(g.id).map((r) => (
                <div key={r.display + r.label} className="shortcut-row">
                  <kbd>{r.display}</kbd>
                  <span>{t(r.label as MessageKey)}</span>
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
