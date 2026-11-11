/**
 * File-system bridge. In Electron it goes through the preload API (native dialogs, real paths,
 * autosave in the user-data folder). In a plain browser (used for quick UI testing) it falls back
 * to downloads, a file picker and localStorage.
 */
export interface OpenedFile {
  path: string
  name: string
  bytes: Uint8Array
}

export interface RecoveryMeta {
  filePath: string | null
  fileName: string | null
  dirty: boolean
}

export interface DiscardPrompt {
  message: string
  save: string
  dontSave: string
  cancel: string
}

export interface PlatformApi {
  /** Returns the saved path, or null if the user cancelled. `path` null → ask with a Save dialog. */
  saveFile(bytes: Uint8Array, path: string | null, suggestedName: string): Promise<{ path: string; name: string } | null>
  openFile(): Promise<OpenedFile | null>
  readRecovery(): Promise<{ bytes: Uint8Array; meta: RecoveryMeta } | null>
  writeRecovery(bytes: Uint8Array, meta: RecoveryMeta): Promise<void>
  /** Ask what to do with unsaved changes. */
  confirmDiscard(prompt: DiscardPrompt): Promise<'save' | 'discard' | 'cancel'>
  setTitle(title: string): void
  /** Main process asks the page to flush the autosave before the window closes. */
  onBeforeClose(handler: () => Promise<void>): void
}

declare global {
  interface Window {
    inkboard?: PlatformApi & { platform: string }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const browserApi: PlatformApi = {
  async saveFile(bytes, _path, suggestedName) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart]))
    a.download = suggestedName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return { path: suggestedName, name: suggestedName }
  },
  openFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.inkboard'
      input.onchange = async () => {
        const f = input.files?.[0]
        if (!f) return resolve(null)
        resolve({ path: f.name, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
      }
      input.click()
    })
  },
  async readRecovery() {
    try {
      const raw = localStorage.getItem('inkboard-recovery')
      if (!raw) return null
      const { b64, meta } = JSON.parse(raw)
      return { bytes: base64ToBytes(b64), meta }
    } catch {
      return null
    }
  },
  async writeRecovery(bytes, meta) {
    try {
      localStorage.setItem('inkboard-recovery', JSON.stringify({ b64: bytesToBase64(bytes), meta }))
    } catch {
      // Quota exceeded (large images) — browser mode is for testing only.
    }
  },
  async confirmDiscard(prompt) {
    return window.confirm(`${prompt.message}\n\nOK = ${prompt.dontSave}`) ? 'discard' : 'cancel'
  },
  setTitle(title) {
    document.title = title
  },
  onBeforeClose() {}
}

export const platform: PlatformApi = window.inkboard ?? browserApi
