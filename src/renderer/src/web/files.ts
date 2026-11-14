import type { ExportKind } from '../../../shared/library'
import type { BoardFilesApi, BoardStoreApi } from '../../../shared/platform'

/**
 * .inkboard files and exports in the browser. Where the File System Access API exists (Chrome, Edge)
 * the user picks where to save; elsewhere the file is downloaded. The board itself always stays in the
 * browser library: a saved file is a copy, not a file the board keeps writing to as on the desktop.
 */

interface PickerWindow {
  showSaveFilePicker?: (options: { suggestedName: string; types: FileType[] }) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options: { types: FileType[]; multiple: boolean }) => Promise<FileSystemFileHandle[]>
}

interface FileType {
  description: string
  accept: Record<string, string[]>
}

const BOARD_TYPE: FileType = { description: 'Inkboard board', accept: { 'application/x-inkboard': ['.inkboard'] } }

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError'

export function download(data: Uint8Array | string, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data as BlobPart]))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Saves bytes where the user chooses (or downloads them); false when the user cancelled. */
async function saveFile(data: Uint8Array, name: string, type: FileType): Promise<boolean> {
  const picker = (window as PickerWindow).showSaveFilePicker
  if (!picker) {
    download(data, name)
    return true
  }
  try {
    const handle = await picker({ suggestedName: name, types: [type] })
    const writable = await handle.createWritable()
    await writable.write(data as BlobPart)
    await writable.close()
    return true
  } catch (err) {
    if (isAbort(err)) return false
    throw err
  }
}

/** Lets the user pick a .inkboard file; null when cancelled. */
async function pickBoardFile(): Promise<File | null> {
  const picker = (window as PickerWindow).showOpenFilePicker
  if (picker) {
    try {
      const [handle] = await picker({ types: [BOARD_TYPE], multiple: false })
      return handle ? await handle.getFile() : null
    } catch (err) {
      if (isAbort(err)) return null
      throw err
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.inkboard'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function createWebFiles(store: BoardStoreApi): BoardFilesApi {
  return {
    async saveAsFile(id, bytes, suggestedName) {
      if (!(await saveFile(bytes, `${suggestedName}.inkboard`, BOARD_TYPE))) return null
      const entry = (await store.list()).boards.find((b) => b.id === id)
      return entry ?? null
    },
    async importFile() {
      const file = await pickBoardFile()
      if (!file) return null
      return store.create(file.name.replace(/\.inkboard$/i, ''), new Uint8Array(await file.arrayBuffer()))
    },
    // Boards in the browser have no file of their own to find or show.
    async locate() {
      return null
    },
    async showInFolder() {},
    async takePendingOpen() {
      return null
    }
  }
}

/**
 * Exports. PNG is saved like a file; for PDF the browser's print dialog opens with the board on a page
 * of its exact size ("Save as PDF"), the closest the web has to the desktop's direct PDF export.
 */
export async function exportFile(kind: ExportKind, data: Uint8Array | string, suggestedName: string, width: number, height: number): Promise<string | null> {
  if (kind === 'png') {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    return (await saveFile(bytes, `${suggestedName}.png`, { description: 'PNG image', accept: { 'image/png': ['.png'] } })) ? suggestedName : null
  }
  const svg = typeof data === 'string' ? data : new TextDecoder().decode(data)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  frame.srcdoc = `<!doctype html><html><head><title>${suggestedName.replace(/[<&]/g, '')}</title><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0}svg{display:block;width:${width}px;height:${height}px}</style></head><body>${svg}</body></html>`
  document.body.appendChild(frame)
  await new Promise((resolve) => (frame.onload = resolve))
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  // The print dialog blocks until it closes in most browsers; keep the frame a moment longer anyway.
  setTimeout(() => frame.remove(), 60_000)
  return suggestedName
}
