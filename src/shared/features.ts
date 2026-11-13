/**
 * Feature flags: features ship with defaults that users can override in Settings
 * without code changes.
 *
 * Where the values come from, in order:
 * 1. the defaults below,
 * 2. `features.json` in the app's data folder (userData), written by Settings → Experimental
 *    features or edited by hand, for example `{ "darkTheme": true }`.
 * The main process reads the file once at startup and hands the result to the page through the
 * preload. Unknown keys and values that are not booleans are ignored, so a broken file can never
 * stop the app from starting: it simply falls back to the defaults.
 *
 * Adding a flag: add an entry here, plus `feature.<id>` and `feature.<id>.hint` texts in i18n.ts.
 * Removing one (the feature became permanent or was dropped): delete the entry; old values in
 * users' files are then ignored.
 */
export const FEATURES = {
  darkTheme: {
    default: true,
    description: 'Dark theme for the app interface (toolbars, menus, home screen). Board content keeps its colors.'
  },
  chalkboard: {
    default: false,
    description: 'Dark green chalkboard surface for boards, with chalk-white default ink.'
  }
} as const satisfies Record<string, { default: boolean; description: string }>

export type FeatureId = keyof typeof FEATURES
export type FeatureFlags = Record<FeatureId, boolean>

export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[]

/** File name of the overrides inside the userData folder. */
export const FEATURES_FILE = 'features.json'

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === 'string' && Object.hasOwn(FEATURES, v)
}

export function defaultFeatures(): FeatureFlags {
  const out = {} as FeatureFlags
  for (const id of FEATURE_IDS) out[id] = FEATURES[id].default
  return out
}

/** Only the valid entries of a parsed overrides object (known id, boolean value). */
export function cleanOverrides(v: unknown): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (isFeatureId(k) && typeof val === 'boolean') out[k] = val
  }
  return out
}

/** Defaults with valid overrides applied. */
export function resolveFeatures(overrides: unknown): FeatureFlags {
  return { ...defaultFeatures(), ...cleanOverrides(overrides) }
}

/** Parse the text of `features.json`; missing, empty or broken text gives the defaults. */
export function parseFeaturesFile(text: string | null | undefined): FeatureFlags {
  if (!text) return defaultFeatures()
  try {
    return resolveFeatures(JSON.parse(text))
  } catch {
    return defaultFeatures()
  }
}

/**
 * Text for `features.json`: only flags that differ from their default are written, so a flag whose
 * default changes in a later release follows the new default unless the user chose otherwise.
 */
export function featuresFileText(flags: Partial<FeatureFlags>): string {
  const out: Partial<FeatureFlags> = {}
  for (const id of FEATURE_IDS) {
    const v = flags[id]
    if (typeof v === 'boolean' && v !== FEATURES[id].default) out[id] = v
  }
  return `${JSON.stringify(out, null, 2)}\n`
}
