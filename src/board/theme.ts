import { useLayoutEffect } from 'react'
import { withSurface } from './engine/surface'
import { useFeature } from './features'
import { prefsStore, usePrefs } from './store'

/** Applies the interface theme and, when requested by the host, matches the board surface to it. */
export function useAppTheme(surfaceFollowsTheme: boolean): void {
  const enabled = useFeature('darkTheme')
  const pref = usePrefs((s) => s.theme)
  useLayoutEffect(() => {
    const root = document.documentElement
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = enabled && (pref === 'dark' || (pref === 'system' && system.matches))
      if (dark) root.dataset.theme = 'dark'
      else delete root.dataset.theme
      if (surfaceFollowsTheme) {
        const { background, setBackground } = prefsStore.getState()
        const next = withSurface(background, dark)
        if (next !== background) setBackground(next)
      }
    }
    apply()
    const unsubscribe = prefsStore.subscribe((state, previous) => {
      if (surfaceFollowsTheme && state.background !== previous.background) apply()
    })
    if (enabled && pref === 'system') system.addEventListener('change', apply)
    return () => {
      unsubscribe()
      system.removeEventListener('change', apply)
    }
  }, [enabled, pref, surfaceFollowsTheme])
}
