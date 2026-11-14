import type { PlatformApi } from '../../shared/platform'
import { createWebPlatform } from './web/platform'

declare global {
  interface Window {
    inkboard?: PlatformApi
  }
}

/**
 * The platform the app shell runs on (ports and adapters, docs/ARCHITECTURE.md): in Electron the
 * preload exposes the desktop one (SQLite library, native files, auto-update); in a browser it's the
 * web one (IndexedDB, file pickers). The rest of the app only sees PlatformApi.
 */
export const platform: PlatformApi = window.inkboard ?? createWebPlatform()
