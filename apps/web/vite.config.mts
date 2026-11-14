import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '../..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

// The web app, served from the landing page's site at /inkboard/app/ (see .github/workflows/pages.yml).
//   npm run dev:web     http://localhost:5174/inkboard/app/
//   npm run build:web   into dist/site/app (run after build:site, which empties dist/site)
export default defineConfig({
  root: import.meta.dirname,
  base: '/inkboard/app/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5174, fs: { allow: [searchForWorkspaceRoot(root)] } },
  build: {
    outDir: resolve(root, 'dist/site/app'),
    emptyOutDir: true
  }
})
