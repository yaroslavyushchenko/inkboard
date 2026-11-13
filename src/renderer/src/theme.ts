import { useEffect } from 'react'
import { useFeature } from './features'
import { useUI } from './store'

/**
 * Applies the interface theme as `data-theme="dark"` on <html>; styles.css swaps its colour tokens
 * for it. Only the app chrome changes: the board canvas, thumbnails and exports draw their own
 * colours and are never inverted or recoloured. Event-driven only (no per-frame work): it reacts to
 * the setting, the feature flag and the system light/dark switch.
 */
export function useAppTheme(): void {
  const enabled = useFeature('darkTheme')
  const pref = useUI((s) => s.theme)
  useEffect(() => {
    const root = document.documentElement
    if (!enabled || pref === 'light') {
      delete root.dataset.theme
      return
    }
    if (pref === 'dark') {
      root.dataset.theme = 'dark'
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      if (mq.matches) root.dataset.theme = 'dark'
      else delete root.dataset.theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [enabled, pref])
}
