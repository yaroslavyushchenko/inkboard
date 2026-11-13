// Turns the built landing page into static HTML, one page per language, plus sitemap.xml.
// Runs after `vite build --config site.vite.config.mts` (see `npm run build:site`): it fills the
// built index.html template with the server-rendered markup, so search engines and visitors without
// JavaScript get the full page, and React then hydrates it in the browser.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createServer } from 'vite'

const OUT = 'dist/site'

const vite = await createServer({
  configFile: 'site.vite.config.mts',
  appType: 'custom',
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false }
})

try {
  const { renderPages, sitemap } = await vite.ssrLoadModule('/src/server.tsx')
  const template = await readFile(join(OUT, 'index.html'), 'utf8')
  for (const page of renderPages()) {
    const html = fill(template, {
      '<html lang="en">': `<html lang="${page.lang}">`,
      '<!--ssr-head-->': page.head,
      '<!--ssr-app-->': page.html
    })
    const file = join(OUT, page.file)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, html)
    console.log(`prerendered ${file}`)
  }
  await writeFile(join(OUT, 'sitemap.xml'), sitemap())
} finally {
  await vite.close()
}

function fill(template, parts) {
  let html = template
  for (const [marker, value] of Object.entries(parts)) {
    if (!html.includes(marker)) throw new Error(`site/index.html has no ${marker}`)
    html = html.replace(marker, () => value)
  }
  return html
}
