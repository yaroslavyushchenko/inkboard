import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** What the renderer shows in the update banner / settings. */
export interface UpdateState {
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  /** No silent install on this platform (macOS without signing, .deb): offer a download link. */
  manual?: boolean
  url?: string
}

const REPO = 'yaroslavyushchenko/inkboard'
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/** Compare "1.2.3" versions. */
function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/**
 * Auto-update from GitHub Releases.
 * Windows (NSIS) and Linux AppImage download in the background and install on restart / quit.
 * macOS (not code-signed yet) and .deb only get a "new version available → Download" notice.
 */
export function initUpdater(getWindow: () => BrowserWindow | null, beforeInstall: () => void): void {
  let state: UpdateState = { status: 'idle' }
  const canAutoInstall = process.platform === 'win32' || (process.platform === 'linux' && !!process.env['APPIMAGE'])
  const set = (s: UpdateState): void => {
    state = s
    getWindow()?.webContents.send('update:state', s)
  }

  if (canAutoInstall) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
    autoUpdater.on('update-available', (i) => set({ status: 'downloading', version: i.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => set({ status: 'ready', version: i.version }))
    autoUpdater.on('update-not-available', () => set({ status: 'none' }))
    autoUpdater.on('error', (err) => {
      console.error('Auto-update error', err)
      set({ status: 'error' })
    })
  }

  /** macOS / .deb: ask GitHub for the latest release and compare versions. */
  const manualCheck = async (): Promise<void> => {
    set({ status: 'checking' })
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rel = (await res.json()) as { tag_name: string; html_url: string }
      if (newer(rel.tag_name, app.getVersion())) {
        set({ status: 'available', version: rel.tag_name.replace(/^v/, ''), manual: true, url: rel.html_url || RELEASES_URL })
      } else {
        set({ status: 'none' })
      }
    } catch (err) {
      console.error('Update check failed', err)
      set({ status: 'error' })
    }
  }

  const check = async (): Promise<void> => {
    // Never interrupt a download / ready-to-install update with a new check.
    if (state.status === 'downloading' || state.status === 'ready') return
    if (!app.isPackaged) return set({ status: 'none' })
    if (canAutoInstall) {
      try {
        await autoUpdater.checkForUpdates()
      } catch {
        set({ status: 'error' })
      }
    } else {
      await manualCheck()
    }
  }

  ipcMain.handle('update:get-state', () => state)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:install', () => {
    if (state.status !== 'ready') return
    beforeInstall()
    // Silent install, then start the new version.
    autoUpdater.quitAndInstall(true, true)
  })
  ipcMain.handle('update:open-download', () => shell.openExternal(state.url ?? RELEASES_URL))
  ipcMain.handle('app:version', () => app.getVersion())

  if (app.isPackaged) {
    setTimeout(() => void check(), 5000)
    setInterval(() => void check(), CHECK_EVERY_MS)
  }
}
