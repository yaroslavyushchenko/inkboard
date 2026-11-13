import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The landing page. `npm run build:site` builds it here, then scripts/prerender-site.mjs renders
// every language into static HTML (dist/site/index.html and dist/site/uk/index.html).
export default defineConfig({
  root: 'site',
  base: '/inkboard/',
  plugins: [react()],
  build: {
    outDir: '../dist/site',
    emptyOutDir: true
  }
})
