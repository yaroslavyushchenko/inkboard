import { useEffect } from 'react'
import { editor } from './editor'
import { useUI } from './store'
import { BackgroundPicker } from './ui/BackgroundPicker'
import { GraphDialog } from './ui/GraphDialog'
import { Board } from './ui/Board'
import { HomeScreen } from './ui/HomeScreen'
import { MainMenu } from './ui/MainMenu'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { TextEditor } from './ui/TextEditor'
import { Toolbar } from './ui/Toolbar'
import { UpdateBanner } from './ui/UpdateBanner'
import { VersionHistory } from './ui/VersionHistory'
import { ZoomControls } from './ui/ZoomControls'

export function App() {
  const view = useUI((s) => s.view)
  useEffect(() => {
    void editor.start()
  }, [])
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
    <div className="app">
      {/* The board stays mounted under the home screen so switching back is instant. */}
      <Board />
      <TextEditor />
      <SelectionToolbar />
      <MainMenu />
      <Toolbar />
      <BackgroundPicker />
      <ZoomControls />
      <VersionHistory />
      <GraphDialog />
      <UpdateBanner />
      <ShortcutsDialog />
      {view === 'home' && <HomeScreen />}
    </div>
  )
}
