// The desktop board library (SQLite in the Electron main process) against the shared library
// contract, the same one the browser's IndexedDB store passes (webLibrary.test.ts). Run: npm test
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'
import { Library } from '../src/main/library.ts'
import { libraryContract } from './libraryContract.ts'

const opened: { dir: string; lib: Library }[] = []
after(async () => {
  // Close every database first: Windows can't delete a file that is still open.
  for (const { dir, lib } of opened) {
    lib.close()
    await rm(dir, { recursive: true, force: true })
  }
})

libraryContract('SQLite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-contract-'))
  const lib = new Library(dir)
  opened.push({ dir, lib })
  await lib.init()
  return lib
})
