import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'site',
  base: '/inkboard/',
  plugins: [react()],
  server: {
    fs: { allow: [searchForWorkspaceRoot('.')] }
  },
  build: {
    outDir: '../dist/site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        site: resolve('site/index.html'),
        demo: resolve('site/demo/index.html')
      }
    }
  }
})
