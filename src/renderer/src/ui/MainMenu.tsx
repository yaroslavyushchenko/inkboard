import { useCallback, useState } from 'react'
import { editor } from '../editor'
import { useT } from '../i18n'
import { useUI } from '../store'
import { MenuIcon } from './icons'
import { Popover } from './Popover'

/** Top-left: menu button with file actions, plus the board name. */
export function MainMenu() {
  const t = useT()
  const fileName = useUI((s) => s.fileName)
  const dirty = useUI((s) => s.dirty)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const run = (fn: () => unknown) => () => {
    setOpen(false)
    void fn()
  }
  const name = (fileName ?? t('file.untitled')).replace(/\.inkboard$/i, '')
  return (
    <div className="main-menu">
      <div className="panel main-menu-bar">
        <button data-popover-anchor className="icon-btn" title={t('menu.title')} onClick={() => setOpen((o) => !o)}>
          <MenuIcon />
        </button>
        <span className="board-name" title={dirty ? t('file.unsaved') : undefined}>
          {name}
          {dirty && <span className="dirty-dot" />}
        </span>
      </div>
      {open && (
        <Popover onClose={close} className="menu-popover">
          <button className="menu-item" onClick={run(() => editor.newBoard())}>
            <span>{t('file.new')}</span>
            <kbd>Ctrl+N</kbd>
          </button>
          <button className="menu-item" onClick={run(() => editor.open())}>
            <span>{t('file.open')}</span>
            <kbd>Ctrl+O</kbd>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={run(() => editor.save())}>
            <span>{t('file.save')}</span>
            <kbd>Ctrl+S</kbd>
          </button>
          <button className="menu-item" onClick={run(() => editor.save(true))}>
            <span>{t('file.saveAs')}</span>
            <kbd>Ctrl+Shift+S</kbd>
          </button>
        </Popover>
      )}
    </div>
  )
}
