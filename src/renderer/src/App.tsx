import { useEffect } from 'react'
import { editor } from './editor'
import { useUI } from './store'
import { BackgroundPicker } from './ui/BackgroundPicker'
import { Board } from './ui/Board'
import { HomeScreen } from './ui/HomeScreen'
import { MainMenu } from './ui/MainMenu'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { Toolbar } from './ui/Toolbar'
import { VersionHistory } from './ui/VersionHistory'
import { ZoomControls } from './ui/ZoomControls'

export function App() {
  const view = useUI((s) => s.view)
  useEffect(() => {
    void editor.start()
  }, [])
  return (
    <div className="app">
      {/* The board stays mounted under the home screen so switching back is instant. */}
      <Board />
      <SelectionToolbar />
      <MainMenu />
      <Toolbar />
      <BackgroundPicker />
      <ZoomControls />
      <VersionHistory />
      {view === 'home' && <HomeScreen />}
    </div>
  )
}
