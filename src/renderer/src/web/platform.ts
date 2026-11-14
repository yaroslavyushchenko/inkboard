import { cleanOverrides, parseFeaturesFile } from '../../../shared/features'
import type { BoardStoreApi, PlatformApi } from '../../../shared/platform'
import { createWebFiles, exportFile } from './files'
import { createIndexedDbStore } from './library'

/** Set by the web build (apps/web/vite.config.mts); absent when the renderer runs some other way. */
declare const __APP_VERSION__: string | undefined

const FEATURES_KEY = 'inkboard-features'

function readFeatures(): string | null {
  try {
    return localStorage.getItem(FEATURES_KEY)
  } catch {
    return null
  }
}

/**
 * Asks the browser to keep the library even when the disk gets full (otherwise it may clear a site's
 * data). Done after the first save rather than on load: Firefox shows a prompt for it.
 */
function persistAfterFirstSave(store: BoardStoreApi): BoardStoreApi {
  let asked = false
  return {
    ...store,
    async save(id, bytes, thumb) {
      const result = await store.save(id, bytes, thumb)
      if (!asked) {
        asked = true
        void navigator.storage?.persist?.().catch(() => false)
      }
      return result
    }
  }
}

/** The app's platform in a browser: IndexedDB library, file pickers, print-to-PDF, no installer updates. */
export function createWebPlatform(): PlatformApi {
  const store = persistAfterFirstSave(createIndexedDbStore())
  const features = parseFeaturesFile(readFeatures())
  return {
    platform: 'web',
    features,
    async setFeature(id, on) {
      Object.assign(features, cleanOverrides({ [id]: on }))
      try {
        localStorage.setItem(FEATURES_KEY, JSON.stringify(features))
      } catch {
        // Still applies for this visit.
      }
      return { ...features }
    },
    update: {
      async getState() {
        return { status: 'web' }
      },
      async check() {},
      async install() {
        location.reload()
      },
      async openDownload() {},
      async version() {
        return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
      },
      onState() {}
    },
    capabilities: { backup: false, showInFolder: false },
    library: { ...store, ...createWebFiles(store) },
    async chooseBackupDir() {
      return null
    },
    async disableBackup() {},
    exportFile,
    setTitle(title) {
      document.title = title
    },
    onOpenBoard() {},
    onFlushRequest(handler) {
      // A hidden tab may be frozen or discarded without notice: save while we still can.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void handler()
      })
    },
    onBeforeClose(handler) {
      window.addEventListener('pagehide', () => void handler())
    }
  }
}
