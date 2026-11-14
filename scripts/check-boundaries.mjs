// Keeps the layers apart (docs/ARCHITECTURE.md). Part of `npm run typecheck`.
//
// - A package under packages/ imports only its own files, the @inkboard packages and npm packages
//   listed in its own package.json "dependencies". So core can never pick up React, Electron or a
//   feature by accident.
// - Package dependencies have no cycles.
// - Code outside packages/ reaches a package by its name (@inkboard/core/scene), never by a
//   relative path into packages/.
// - The landing page (site/) stands alone: it imports nothing from src/ or packages/.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const IMPORT = /(?:^|[^\w.])(?:import|export)\s*(?:[\w*{}\s,]+from\s*)?\(?\s*['"]([^'"]+)['"]/g
const problems = []

function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (/\.(ts|tsx|mts)$/.test(name) && !name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

function imports(file) {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(IMPORT)].map((m) => m[1])
}

const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2) : spec.split('/').slice(0, 1)).join('/')
const inside = (path, dir) => path === dir || path.startsWith(dir + sep)

// Packages.
const packagesDir = join(ROOT, 'packages')
const packages = new Map()
for (const name of readdirSync(packagesDir)) {
  const dir = join(packagesDir, name)
  if (!statSync(dir).isDirectory()) continue
  const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  packages.set(json.name, { dir, deps: Object.keys(json.dependencies ?? {}) })
}

for (const [name, { dir, deps }] of packages) {
  const src = join(dir, 'src')
  for (const file of files(src)) {
    for (const spec of imports(file)) {
      const where = `${relative(ROOT, file)}: '${spec}'`
      if (spec.startsWith('.')) {
        if (!inside(resolve(dirname(file), spec), src)) problems.push(`${where} leaves ${name}`)
      } else if (packageName(spec) === name) {
        problems.push(`${where}: import your own files with a relative path`)
      } else if (!deps.includes(packageName(spec))) {
        problems.push(`${where}: ${packageName(spec)} is not in ${name}'s dependencies`)
      }
    }
  }
}

// No cycles between packages.
const state = new Map()
function visit(name, path) {
  if (state.get(name) === 'done') return
  if (state.get(name) === 'open') return problems.push(`dependency cycle: ${[...path, name].join(' -> ')}`)
  state.set(name, 'open')
  for (const dep of packages.get(name)?.deps ?? []) if (packages.has(dep)) visit(dep, [...path, name])
  state.set(name, 'done')
}
for (const name of packages.keys()) visit(name, [])

// Apps and the site.
for (const base of ['src', 'apps', 'site', 'tests']) {
  for (const file of files(join(ROOT, base))) {
    for (const spec of imports(file)) {
      const where = `${relative(ROOT, file)}: '${spec}'`
      if (!spec.startsWith('.')) {
        if (base === 'site' && spec.startsWith('@inkboard/')) problems.push(`${where}: the site imports no app code`)
        continue
      }
      const target = resolve(dirname(file), spec)
      if (inside(target, packagesDir)) problems.push(`${where}: import packages by name (@inkboard/...)`)
      if (base === 'site' && !inside(target, join(ROOT, 'site'))) problems.push(`${where}: the site imports no app code`)
    }
  }
}

if (problems.length) {
  console.error(`Layer boundaries broken (docs/ARCHITECTURE.md):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
