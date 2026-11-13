import { useEffect } from 'react'
import { BoardWorkspace } from '../../board/BoardWorkspace'
import { useUI } from '../../board/store'
import type { BoardFileActions } from '../../board/ui/Board'
import { boardLibrary } from './boardLibrary'
import { BackupSettings } from './ui/BackupSettings'
import { HomeScreen } from './ui/HomeScreen'
import { MainMenu } from './ui/MainMenu'
import { SaveSelectionTemplate } from './ui/SaveSelectionTemplate'
import { TemplatesMenu } from './ui/TemplatesMenu'
import { AboutSection, UpdateBanner } from './ui/UpdateBanner'

const fileActions: BoardFileActions = {
  newBoard: () => boardLibrary.newBoard(),
  openFile: () => boardLibrary.openFile(),
  home: () => boardLibrary.goHome(),
  save: () => boardLibrary.save(),
  saveAs: () => boardLibrary.saveAsFile()
}

export function App() {
  const view = useUI((s) => s.view)
  useEffect(() => {
    void boardLibrary.start()
  }, [])
  return (
    <BoardWorkspace
      fileActions={fileActions}
      menu={<MainMenu />}
      extraTools={<TemplatesMenu />}
      selectionActions={(side) => <SaveSelectionTemplate side={side} />}
      storageSettings={<BackupSettings />}
      about={<AboutSection />}
    >
      <UpdateBanner />
      {view === 'home' && <HomeScreen />}
    </BoardWorkspace>
  )
}
