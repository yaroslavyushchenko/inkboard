# Inkboard: notes for AI assistants

Free, source-available (FSL-1.1-MIT) infinite whiteboard for pen tablets; Electron + React + TS,
custom Canvas 2D engine in `src/board/engine`. Roadmap: `docs/PLAN.md`.

## Don't break what exists
- **Keyboard shortcuts**: all of them live in `src/board/shortcuts.ts` (matched by physical key
  `KeyboardEvent.code`, never `e.key`, so non-Latin layouts work). Don't change or remove one without
  asking the user. Adding one = update `shortcuts.ts`, `docs/SHORTCUTS.md`, `tests/shortcuts.test.ts`
  and both translations in `i18n.ts`.
- Before committing run: `npm run typecheck && npm test && npm run build`.
- UI text: English + Ukrainian only (`i18n.ts`). No Russian localization. Code, docs and commits in English.
- Board data must stay vector; file format changes need a `FORMAT_VERSION` bump in `engine/serialize.ts`
  and must keep reading older files.
- Writing (UI, docs, site, commits, comments): no em dashes; rephrase instead.
- Saving is power-cut safe (`src/main/fsutil.ts` writeDurable); don't bypass it for board/library files.

## Releasing
Bump `version` in `package.json`, update `.github/release-notes.md`, push a `vX.Y.Z` tag. The Release
workflow builds Windows / macOS / Linux and publishes the auto-update feed. Ask the user before pushing.
