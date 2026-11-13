import { renderToString } from 'react-dom/server'
import { Site } from './Site'
import { pageInfo, type SiteLanguage } from './messages'
import { LANGUAGE_KEY, LANGUAGES, pagePath } from './siteData'

/** Build-time entry: scripts/prerender-site.mjs turns each language into a static HTML page. */

export const SITE_ORIGIN = 'https://yaroslavyushchenko.github.io'
const pageUrl = (lang: SiteLanguage) => SITE_ORIGIN + pagePath(lang)
const IMAGE = SITE_ORIGIN + import.meta.env.BASE_URL + 'img/social-preview.png'
const LOCALE = { uk: 'uk_UA', en: 'en_US' } as const

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Ukrainian-speaking visitors who land on the English root page go to uk/, unless they picked
 * English with the language switch. Only the root page has it: crawlers read both pages as is.
 */
const languageRedirect = `<script>(function(){var s;try{s=localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)})}catch(e){}` +
  `if(s==='en')return;if(s==='uk'||(navigator.languages||[navigator.language]).some(function(l){return /^uk\\b/i.test(l)}))` +
  `location.replace(${JSON.stringify(pagePath('uk'))}+location.hash)})()</script>`

function head(lang: SiteLanguage): string {
  const info = pageInfo[lang]
  const other = LANGUAGES.filter((code) => code !== lang)
  return [
    `<title>${escape(info.title)}</title>`,
    `<meta name="description" content="${escape(info.description)}">`,
    `<link rel="canonical" href="${pageUrl(lang)}">`,
    ...LANGUAGES.map((code) => `<link rel="alternate" hreflang="${code}" href="${pageUrl(code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl('en')}">`,
    `<meta property="og:title" content="${escape(info.title)}">`,
    `<meta property="og:description" content="${escape(info.description)}">`,
    `<meta property="og:url" content="${pageUrl(lang)}">`,
    `<meta property="og:locale" content="${LOCALE[lang]}">`,
    ...other.map((code) => `<meta property="og:locale:alternate" content="${LOCALE[code]}">`),
    `<meta property="og:image" content="${IMAGE}">`,
    `<meta name="twitter:image" content="${IMAGE}">`,
    ...(lang === 'en' ? [languageRedirect] : [])
  ].join('\n')
}

export interface Page {
  lang: SiteLanguage
  /** Output path inside the site folder. */
  file: string
  head: string
  html: string
}

export function renderPages(): Page[] {
  return LANGUAGES.map((lang) => ({
    lang,
    file: (lang === 'en' ? '' : lang + '/') + 'index.html',
    head: head(lang),
    html: renderToString(<Site lang={lang} />)
  }))
}

export function sitemap(): string {
  const links = LANGUAGES.map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${pageUrl(code)}"/>`).join('\n')
  const urls = LANGUAGES.map((lang) => `  <url>\n    <loc>${pageUrl(lang)}</loc>\n${links}\n  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
}
