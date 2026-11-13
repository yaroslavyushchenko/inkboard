import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Site } from './Site'
import { languageOfPath } from './siteData'
import './styles.css'

const lang = languageOfPath(location.pathname)
document.documentElement.lang = lang
const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <Site lang={lang} />
  </StrictMode>
)

// The built pages arrive prerendered (scripts/prerender-site.mjs); the dev server sends an empty root.
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
