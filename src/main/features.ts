import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURES_FILE, featuresFileText, isFeatureId, parseFeaturesFile, type FeatureFlags } from '../shared/features'
import { writeDurable } from './fsutil'

let flags: FeatureFlags
let file = ''

/**
 * Read `features.json` from userData once, at startup (a tiny synchronous read before the window
 * exists). The page gets the result through the preload; a change made in Settings is written back
 * here and also applied in the page right away, so nothing has to be re-read later.
 */
export function initFeatures(userData: string): FeatureFlags {
  file = join(userData, FEATURES_FILE)
  let text: string | null = null
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    // No file yet: defaults.
  }
  flags = parseFeaturesFile(text)

  // Synchronous on purpose: the preload needs the flags before the page's first render.
  ipcMain.on('features:get', (e) => {
    e.returnValue = flags
  })
  ipcMain.handle('features:set', async (_e, id: unknown, on: unknown) => {
    if (!isFeatureId(id) || typeof on !== 'boolean') return flags
    flags = { ...flags, [id]: on }
    await writeDurable(file, featuresFileText(flags))
    return flags
  })
  return flags
}
