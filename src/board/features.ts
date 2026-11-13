import { create } from 'zustand'
import { defaultFeatures, type FeatureFlags, type FeatureId } from '../shared/features'

interface FeatureState {
  flags: FeatureFlags
  set: (id: FeatureId, on: boolean) => Promise<void>
}

type SaveFeature = (id: FeatureId, on: boolean) => Promise<FeatureFlags>
let saveFeature: SaveFeature | undefined

/** Feature flags (see src/shared/features.ts). Changes apply at once and are saved for the next start. */
export const useFeatures = create<FeatureState>()((set) => ({
  flags: defaultFeatures(),
  set: async (id, on) => {
    set((s) => ({ flags: { ...s.flags, [id]: on } }))
    if (!saveFeature) return
    try {
      set({ flags: await saveFeature(id, on) })
    } catch (err) {
      console.warn('Could not save feature flags', err)
    }
  }
}))

export const useFeature = (id: FeatureId): boolean => useFeatures((s) => s.flags[id])
export const isFeatureOn = (id: FeatureId): boolean => useFeatures.getState().flags[id]

export function configureFeatures(flags: FeatureFlags, save: SaveFeature): void {
  saveFeature = save
  useFeatures.setState({ flags: { ...flags } })
}
