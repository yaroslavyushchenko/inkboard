import { useEffect, type ReactNode } from 'react'
import type { Editor } from './editor'
import { EditorProvider } from './editorContext'
import { useAppTheme } from './theme'
import { BackgroundPicker } from './ui/BackgroundPicker'
import { FormulaEditor } from './ui/FormulaEditor'
import { FunctionPanel } from './ui/FunctionPanel'
import { MathKeypad } from './ui/MathKeypad'
import { InstrumentPanel } from './ui/InstrumentPanel'
import { GraphDialog } from './ui/GraphDialog'
import { Board, type BoardFileActions } from './ui/Board'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { TextEditor } from './ui/TextEditor'
import { Toolbar } from './ui/Toolbar'
import { InstrumentTip } from './ui/InstrumentTip'
import { ZoomControls } from './ui/ZoomControls'
import { ShortcutsButton } from './ui/ShortcutsButton'

interface BoardWorkspaceProps {
  /** The board's editor, made by the app with createEditor(). */
  editor: Editor
  fileActions?: BoardFileActions
  menu?: ReactNode
  extraTools?: ReactNode
  selectionActions?: (side: 'above' | 'below') => ReactNode
  storageSettings?: ReactNode
  about?: ReactNode
  fixedLanguage?: boolean
  surfaceFollowsTheme?: boolean
  children?: ReactNode
}

export function BoardWorkspace({
  editor, fileActions, menu, extraTools, selectionActions, storageSettings, about, fixedLanguage, surfaceFollowsTheme = false, children
}: BoardWorkspaceProps) {
  useAppTheme(surfaceFollowsTheme)
  useEffect(() => {
    // Buttons and sliders shouldn't keep keyboard focus after a click: a focused button would be
    // "pressed" again by Space (hold-to-pan) or Enter, and the focus ring lingers on the toolbar.
    const drop = (e: PointerEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, input[type="range"], input[type="checkbox"]')
      if (el instanceof HTMLElement) setTimeout(() => document.activeElement === el && el.blur(), 0)
    }
    window.addEventListener('pointerup', drop, true)
    return () => window.removeEventListener('pointerup', drop, true)
  }, [])
  return (
    <EditorProvider editor={editor}>
    <div className="app">
      <Board fileActions={fileActions} />
      <TextEditor />
      <FormulaEditor />
      <SelectionToolbar actions={selectionActions} />
      <Toolbar
        extraTools={extraTools}
        menu={menu}
        settings={<BackgroundPicker storageSettings={storageSettings} about={about} fixedLanguage={fixedLanguage} surfaceFollowsTheme={surfaceFollowsTheme} />}
      />
      <ZoomControls />
      <ShortcutsButton />
      <GraphDialog />
      <FunctionPanel />
      <InstrumentPanel />
      <MathKeypad />
      <InstrumentTip />
      <ShortcutsDialog fileActions={!!fileActions} />
      {children}
    </div>
    </EditorProvider>
  )
}
