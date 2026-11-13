import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { configureFeatures } from '../../board/features'
import { enablePreferenceStorage } from '../../board/store'
import { platform } from './platform'
import '../../board/styles.css'

configureFeatures(platform.features, (id, on) => platform.setFeature(id, on))
enablePreferenceStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
