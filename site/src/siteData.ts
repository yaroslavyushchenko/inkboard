import { useEffect, useState } from 'react'
import type { SiteLanguage } from './messages'

const REPO = 'yaroslavyushchenko/inkboard'
export const RELEASES = `https://github.com/${REPO}/releases/latest`
export const asset = (path: string) => import.meta.env.BASE_URL + path

export type Os = 'win' | 'mac' | 'linux'

export function detectOs(): Os | null {
  const ua = navigator.userAgent
  if (/android|iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return null
  const platform = ((navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform || navigator.platform || ua).toLowerCase()
  if (platform.includes('win')) return 'win'
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('linux')) return 'linux'
  return null
}

/**
 * Every language has its own prerendered page: English at the site root, Ukrainian under uk/.
 * The root page sends Ukrainian-speaking visitors to uk/ unless they picked English before
 * (see the script in server.tsx), so search engines still see both pages as they are.
 */
export const LANGUAGES: readonly SiteLanguage[] = ['uk', 'en']
export const LANGUAGE_KEY = 'inkboard-site-lang'
export const pagePath = (lang: SiteLanguage) => import.meta.env.BASE_URL + (lang === 'uk' ? 'uk/' : '')

export function languageOfPath(path: string): SiteLanguage {
  return path.startsWith(import.meta.env.BASE_URL + 'uk') ? 'uk' : 'en'
}

export function rememberLanguage(lang: SiteLanguage) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang)
  } catch {
    // The link still works when storage is unavailable.
  }
}

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

interface Release {
  tag_name: string
  published_at: string
  html_url: string
  assets: ReleaseAsset[]
}

export function assetSize(file: ReleaseAsset | undefined, version?: string): string {
  if (!file) return ''
  const size = Math.round(file.size / 1048576) + ' MB'
  return version ? version + ' · ' + size : size
}

export function useRelease() {
  const [release, setRelease] = useState<Release | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    }).then(async (response) => {
      if (response.ok) setRelease(await response.json() as Release)
    }).catch(() => {
      // The download links fall back to the Releases page.
    })
    return () => controller.abort()
  }, [])
  const find = (pattern: RegExp) => release?.assets.find((file) => pattern.test(file.name))
  return {
    release,
    assets: { exe: find(/Setup.*\.exe$/i), dmg: find(/\.dmg$/i), appimage: find(/\.AppImage$/i), deb: find(/\.deb$/i) }
  }
}
