import { useEditor } from '../editorContext'
import { useT } from '../i18n'
import { KeyboardIcon } from './icons'

/** Bottom-left button that opens the keyboard shortcuts. */
export function ShortcutsButton() {
  const editor = useEditor()
  const t = useT()
  return (
    <button
      className="panel icon-btn shortcuts-corner"
      title={t('shortcuts.title')}
      aria-label={t('shortcuts.title')}
      onClick={() => editor.session.setState({ shortcutsOpen: true })}
    >
      <KeyboardIcon />
    </button>
  )
}
