import { useEffect } from 'react'
import { editor } from './editor'
import { BackgroundPicker } from './ui/BackgroundPicker'
import { Board } from './ui/Board'
import { MainMenu } from './ui/MainMenu'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { Toolbar } from './ui/Toolbar'
import { ZoomControls } from './ui/ZoomControls'

export function App() {
  useEffect(() => {
    void editor.restore()
  }, [])
  return (
    <div className="app">
      <Board />
      <SelectionToolbar />
      <MainMenu />
      <Toolbar />
      <BackgroundPicker />
      <ZoomControls />
    </div>
  )
}
