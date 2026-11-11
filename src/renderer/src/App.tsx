import { BackgroundPicker } from './ui/BackgroundPicker'
import { Board } from './ui/Board'
import { Toolbar } from './ui/Toolbar'
import { ZoomControls } from './ui/ZoomControls'

export function App() {
  return (
    <div className="app">
      <Board />
      <Toolbar />
      <BackgroundPicker />
      <ZoomControls />
    </div>
  )
}
