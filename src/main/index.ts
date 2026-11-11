import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const FILE_FILTERS = [{ name: 'Inkboard', extensions: ['inkboard'] }]
const recoveryFile = (): string => join(app.getPath('userData'), 'recovery.inkboard')
const recoveryMetaFile = (): string => join(app.getPath('userData'), 'recovery.json')

/** Write via a temp file + rename so a crash mid-write never corrupts an existing board. */
async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

function registerIpc(): void {
  ipcMain.handle('file:save', async (e, bytes: Uint8Array, path: string | null, suggestedName: string) => {
    let target = path
    if (!target) {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const r = await dialog.showSaveDialog(win, {
        defaultPath: join(app.getPath('documents'), suggestedName),
        filters: FILE_FILTERS
      })
      if (r.canceled || !r.filePath) return null
      target = r.filePath.toLowerCase().endsWith('.inkboard') ? r.filePath : `${r.filePath}.inkboard`
    }
    await writeAtomic(target, bytes)
    app.addRecentDocument(target)
    return { path: target, name: basename(target) }
  })

  ipcMain.handle('file:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILE_FILTERS })
    if (r.canceled || !r.filePaths[0]) return null
    const path = r.filePaths[0]
    app.addRecentDocument(path)
    return { path, name: basename(path), bytes: new Uint8Array(await readFile(path)) }
  })

  ipcMain.handle('recovery:read', async () => {
    try {
      const [bytes, meta] = await Promise.all([readFile(recoveryFile()), readFile(recoveryMetaFile(), 'utf8')])
      return { bytes: new Uint8Array(bytes), meta: JSON.parse(meta) }
    } catch {
      return null
    }
  })

  ipcMain.handle('recovery:write', async (_e, bytes: Uint8Array, meta: unknown) => {
    await writeAtomic(recoveryFile(), bytes)
    await writeAtomic(recoveryMetaFile(), JSON.stringify(meta))
  })

  ipcMain.handle('recovery:clear', async () => {
    await rm(recoveryFile(), { force: true })
    await rm(recoveryMetaFile(), { force: true })
  })

  ipcMain.handle(
    'dialog:confirm-discard',
    async (e, p: { message: string; save: string; dontSave: string; cancel: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const r = await dialog.showMessageBox(win, {
        type: 'warning',
        message: p.message,
        buttons: [p.save, p.dontSave, p.cancel],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      })
      return (['save', 'discard', 'cancel'] as const)[r.response]
    }
  )

  ipcMain.on('window:title', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'Inkboard',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // No app menu, so its default accelerators (Ctrl+= / Ctrl+0 page zoom) don't fight the board's zoom.
  // F12 / Ctrl+Shift+I still open DevTools.
  win.webContents.on('before-input-event', (_e, input) => {
    const devtools = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')
    if (input.type === 'keyDown' && devtools) win.webContents.toggleDevTools()
  })

  // Before closing, let the page flush its autosave so the board reopens exactly as it was left.
  let flushed = false
  win.on('close', (e) => {
    if (flushed) return
    e.preventDefault()
    const done = (): void => {
      if (flushed) return
      flushed = true
      ipcMain.removeListener('app:flushed', onFlushed)
      if (!win.isDestroyed()) win.close()
    }
    const onFlushed = (ev: Electron.IpcMainEvent): void => {
      if (ev.sender === win.webContents) done()
    }
    ipcMain.on('app:flushed', onFlushed)
    win.webContents.send('app:before-close')
    setTimeout(done, 3000)
  })

  // Links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Never navigate away from the app (e.g. a file dropped outside the board).
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
