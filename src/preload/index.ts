import { contextBridge, ipcRenderer } from 'electron'

const invoke =
  (channel: string) =>
  (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args)

// Mirrors `PlatformApi` in src/renderer/src/platform.ts.
contextBridge.exposeInMainWorld('inkboard', {
  platform: process.platform,
  capabilities: { backup: true, showInFolder: true },
  library: {
    list: invoke('library:list'),
    thumb: invoke('library:thumb'),
    create: invoke('library:create'),
    load: invoke('library:load'),
    save: invoke('library:save'),
    setLastOpened: invoke('library:set-last-opened'),
    rename: invoke('library:rename'),
    duplicate: invoke('library:duplicate'),
    pin: invoke('library:pin'),
    setTags: invoke('library:set-tags'),
    createTag: invoke('library:create-tag'),
    updateTag: invoke('library:update-tag'),
    deleteTag: invoke('library:delete-tag'),
    remove: invoke('library:remove'),
    restore: invoke('library:restore'),
    purge: invoke('library:purge'),
    listVersions: invoke('library:list-versions'),
    loadVersion: invoke('library:load-version'),
    snapshot: invoke('library:snapshot'),
    saveAsFile: invoke('library:save-as-file'),
    importFile: invoke('library:import-file'),
    locate: invoke('library:locate'),
    showInFolder: invoke('library:show-in-folder'),
    takePendingOpen: invoke('library:take-pending-open'),
    saveTemplate: invoke('template:save'),
    loadTemplate: invoke('template:load'),
    templateThumb: invoke('template:thumb'),
    renameTemplate: invoke('template:rename'),
    deleteTemplate: invoke('template:delete')
  },
  chooseBackupDir: invoke('backup:choose'),
  disableBackup: invoke('backup:disable'),
  exportFile: invoke('export:save'),
  update: {
    getState: invoke('update:get-state'),
    check: invoke('update:check'),
    install: invoke('update:install'),
    openDownload: invoke('update:open-download'),
    version: invoke('app:version'),
    onState: (handler: (s: unknown) => void) => {
      ipcRenderer.on('update:state', (_e, s) => handler(s))
    }
  },
  setTitle: (title: string) => ipcRenderer.send('window:title', title),
  onOpenBoard: (handler: (id: string) => void) => {
    ipcRenderer.on('library:open', (_e, id: string) => handler(id))
  },
  onFlushRequest: (handler: () => Promise<void>) => {
    ipcRenderer.on('app:flush', () => void handler())
  },
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
