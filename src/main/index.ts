import { app, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, shell } from 'electron'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExportKind } from '../shared/library'
import { safeFileName, writeDurable } from './fsutil'
import { Library } from './library'
import { initUpdater } from './updater'

const FILE_FILTERS = [{ name: 'Inkboard', extensions: ['inkboard'] }]

// Separate profile for automated tests / portable setups.
if (process.env['INKBOARD_USER_DATA']) app.setPath('userData', process.env['INKBOARD_USER_DATA'])

let mainWindow: BrowserWindow | null = null
let library: Library
/** Set right before an update installs: the page already saved, skip the close handshake. */
let installingUpdate = false
/** Board files passed on the command line / via "Open with" before the window was ready. */
const pendingPaths: string[] = []

const boardArg = (argv: string[]): string | undefined =>
  argv.find((a) => a.toLowerCase().endsWith('.inkboard') && existsSync(a))

// One app instance: opening a .inkboard file while Inkboard runs focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const path = boardArg(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    if (path) void openPathInApp(path)
  })
}

// macOS delivers files via an event (also before `ready`).
app.on('open-file', (e, path) => {
  e.preventDefault()
  if (mainWindow && library) void openPathInApp(path)
  else pendingPaths.push(path)
})

async function openPathInApp(path: string): Promise<void> {
  try {
    const entry = await library.importFile(path)
    mainWindow?.webContents.send('library:open', entry.id)
  } catch (err) {
    dialog.showErrorBox('Inkboard', `Could not open ${path}\n${(err as Error).message}`)
  }
}

function winOf(e: Electron.IpcMainInvokeEvent): BrowserWindow {
  return BrowserWindow.fromWebContents(e.sender)!
}

async function askSavePath(e: Electron.IpcMainInvokeEvent, suggestedName: string, ext: string, filterName: string): Promise<string | null> {
  const r = await dialog.showSaveDialog(winOf(e), {
    defaultPath: join(app.getPath('documents'), `${safeFileName(suggestedName)}.${ext}`),
    filters: [{ name: filterName, extensions: [ext] }]
  })
  if (r.canceled || !r.filePath) return null
  return r.filePath.toLowerCase().endsWith(`.${ext}`) ? r.filePath : `${r.filePath}.${ext}`
}

/** Vector PDF: print the board's SVG from a hidden window at exactly the drawing's size. */
async function svgToPdf(svg: string, width: number, height: number): Promise<Uint8Array> {
  const html = `<!doctype html><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;padding:0}svg{display:block}</style>${svg}`
  const tmp = join(tmpdir(), `inkboard-export-${process.pid}-${Date.now()}.html`)
  await writeFile(tmp, html)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({
      pageSize: { width: width / 96, height: height / 96 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true
    })
    return new Uint8Array(pdf)
  } finally {
    win.destroy()
    await rm(tmp, { force: true })
  }
}

function registerIpc(): void {
  const h = ipcMain.handle.bind(ipcMain)

  h('library:list', () => library.list())
  h('library:thumb', (_e, id: string) => library.thumb(id))
  h('library:create', (_e, title: string, bytes: Uint8Array) => library.create(title, bytes))
  h('library:load', (_e, id: string) => library.load(id))
  h('library:save', (_e, id: string, bytes: Uint8Array, thumb: Uint8Array | null) => library.save(id, bytes, thumb))
  h('library:set-last-opened', (_e, id: string) => library.setLastOpened(id))
  h('library:rename', (_e, id: string, title: string) => library.rename(id, title))
  h('library:duplicate', (_e, id: string) => library.duplicate(id))
  h('library:pin', (_e, id: string, on: boolean) => library.pin(id, on))
  h('library:set-tags', (_e, id: string, tagIds: string[]) => library.setTags(id, tagIds))
  h('library:create-tag', (_e, name: string, color: string) => library.createTag(name, color))
  h('library:update-tag', (_e, id: string, patch: { name?: string; color?: string }) => library.updateTag(id, patch))
  h('library:delete-tag', (_e, id: string) => library.deleteTag(id))
  h('library:remove', (_e, id: string) => library.remove(id))
  h('library:restore', (_e, id: string) => library.restore(id))
  h('library:purge', (_e, id: string) => library.purge(id))
  h('library:list-versions', (_e, id: string) => library.listVersions(id))
  h('library:load-version', (_e, id: string, ts: number) => library.loadVersion(id, ts))
  h('library:snapshot', (_e, id: string, bytes: Uint8Array) => library.snapshotNow(id, bytes))
  h('template:save', (_e, name: string, bytes: Uint8Array, thumb: Uint8Array | null) => library.saveTemplate(name, bytes, thumb))
  h('template:load', (_e, id: string) => library.loadTemplate(id))
  h('template:thumb', (_e, id: string) => library.templateThumb(id))
  h('template:rename', (_e, id: string, name: string) => library.renameTemplate(id, name))
  h('template:delete', (_e, id: string) => library.deleteTemplate(id))

  h('library:save-as-file', async (e, id: string, bytes: Uint8Array, suggestedName: string) => {
    const path = await askSavePath(e, suggestedName, 'inkboard', 'Inkboard')
    if (!path) return null
    const entry = await library.saveAsFile(id, path, bytes)
    app.addRecentDocument(path)
    return entry
  })

  h('library:import-file', async (e) => {
    const r = await dialog.showOpenDialog(winOf(e), { properties: ['openFile'], filters: FILE_FILTERS })
    if (r.canceled || !r.filePaths[0]) return null
    app.addRecentDocument(r.filePaths[0])
    return library.importFile(r.filePaths[0])
  })

  h('library:locate', async (e, id: string) => {
    const r = await dialog.showOpenDialog(winOf(e), { properties: ['openFile'], filters: FILE_FILTERS })
    if (r.canceled || !r.filePaths[0]) return null
    return library.locate(id, r.filePaths[0])
  })

  h('library:show-in-folder', (_e, id: string) => {
    const p = library.filePath(id)
    if (p) shell.showItemInFolder(p)
  })

  h('library:take-pending-open', async () => {
    const path = pendingPaths.shift()
    if (!path) return null
    try {
      return (await library.importFile(path)).id
    } catch {
      return null
    }
  })

  h('backup:choose', async (e) => {
    const r = await dialog.showOpenDialog(winOf(e), { properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return library.backupDir
    await library.setBackupDir(r.filePaths[0])
    return r.filePaths[0]
  })
  h('backup:disable', () => library.setBackupDir(null))

  h('export:save', async (e, kind: ExportKind, data: Uint8Array | string, suggestedName: string, width: number, height: number) => {
    const path = await askSavePath(e, suggestedName, kind, kind.toUpperCase())
    if (!path) return null
    const bytes = kind === 'pdf' ? await svgToPdf(data as string, width, height) : (data as Uint8Array)
    await writeDurable(path, bytes)
    return path
  })

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
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
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
    if (flushed || installingUpdate) return
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
    setTimeout(done, 4000)
  })

  // Windows logoff/shutdown: save immediately.
  win.on('session-end', () => win.webContents.send('app:flush'))

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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  const userData = app.getPath('userData')
  const snapshotMs = Number(process.env['INKBOARD_SNAPSHOT_MS']) || undefined
  library = new Library(join(userData, 'Library'), snapshotMs)
  await library.init({ bytes: join(userData, 'recovery.inkboard'), meta: join(userData, 'recovery.json') })

  const argPath = boardArg(process.argv)
  if (argPath) pendingPaths.push(argPath)

  registerIpc()
  initUpdater(
    () => mainWindow,
    () => {
      installingUpdate = true
    }
  )
  createWindow()

  // Sleep / shutdown: flush the autosave right away.
  const flush = (): void => mainWindow?.webContents.send('app:flush')
  powerMonitor.on('suspend', flush)
  powerMonitor.on('shutdown', flush)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
