import { copyFile, open, readFile, rename, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

/**
 * Crash- and power-loss-safe write:
 * 1. write to `<path>.tmp` and fsync it (data is physically on disk),
 * 2. keep the previous version as `<path>.bak`,
 * 3. atomically rename the temp file over the target.
 * A power cut at any moment leaves either the old or the new file intact, never a half-written one.
 */
export async function writeDurable(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${path}.tmp`
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  try {
    await copyFile(path, `${path}.bak`)
  } catch {
    // No previous version yet.
  }
  await rename(tmp, path)
}

/** Read a file written by writeDurable, falling back to its .bak if the main copy fails `validate`. */
export async function readDurable(path: string, validate: (b: Buffer) => boolean): Promise<Buffer> {
  try {
    const b = await readFile(path)
    if (validate(b)) return b
  } catch {
    // fall through to the backup
  }
  const bak = await readFile(`${path}.bak`)
  if (!validate(bak)) throw new Error(`Corrupt file: ${path}`)
  return bak
}

export async function removeWithBackup(path: string): Promise<void> {
  await rm(path, { force: true })
  await rm(`${path}.bak`, { force: true })
  await rm(`${path}.tmp`, { force: true })
}

/** Full integrity check of a board file: gzip must decompress and contain an Inkboard JSON header. */
export function isValidBoard(b: Buffer): boolean {
  try {
    const raw = b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b
    return raw.subarray(0, 40).toString('utf8').includes('"format":"inkboard"')
  } catch {
    return false
  }
}

/** File-name-safe version of a board title. */
export function safeFileName(title: string): string {
  const s = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim()
  return (s || 'Board').slice(0, 100)
}
