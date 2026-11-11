import { contextBridge, ipcRenderer } from 'electron'

// Mirrors `PlatformApi` in src/renderer/src/platform.ts.
contextBridge.exposeInMainWorld('inkboard', {
  platform: process.platform,
  saveFile: (bytes: Uint8Array, path: string | null, suggestedName: string) =>
    ipcRenderer.invoke('file:save', bytes, path, suggestedName),
  openFile: () => ipcRenderer.invoke('file:open'),
  readRecovery: () => ipcRenderer.invoke('recovery:read'),
  writeRecovery: (bytes: Uint8Array, meta: unknown) => ipcRenderer.invoke('recovery:write', bytes, meta),
  confirmDiscard: (prompt: unknown) => ipcRenderer.invoke('dialog:confirm-discard', prompt),
  setTitle: (title: string) => ipcRenderer.send('window:title', title),
  onBeforeClose: (handler: () => Promise<void>) => {
    ipcRenderer.on('app:before-close', async () => {
      try {
        await handler()
      } finally {
        ipcRenderer.send('app:flushed')
      }
    })
  }
})
