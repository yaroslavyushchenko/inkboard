import { create } from 'zustand'
import type { FeatureFlags, FeatureId } from '../../shared/features'
import { platform } from './platform'

interface FeatureState {
  flags: FeatureFlags
  set: (id: FeatureId, on: boolean) => Promise<void>
}

/** Feature flags (see src/shared/features.ts). Changes apply at once and are saved for the next start. */
export const useFeatures = create<FeatureState>()((set) => ({
  flags: { ...platform.features },
  set: async (id, on) => {
    set((s) => ({ flags: { ...s.flags, [id]: on } }))
    try {
      set({ flags: await platform.setFeature(id, on) })
    } catch (err) {
      console.warn('Could not save feature flags', err)
    }
  }
}))

export const useFeature = (id: FeatureId): boolean => useFeatures((s) => s.flags[id])
export const isFeatureOn = (id: FeatureId): boolean => useFeatures.getState().flags[id]
