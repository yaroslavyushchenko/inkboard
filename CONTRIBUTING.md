# Contributing to Inkboard

Thanks for helping! Inkboard is made for teachers who use a pen tablet, so the best contributions
come from real lessons: what was hard to draw, what got in the way, what's missing.

## Reporting bugs and ideas

[Open an issue](https://github.com/yaroslavyushchenko/inkboard/issues/new/choose) in English or
Ukrainian. Please include the Inkboard version (menu ☰ or the "All boards" screen), your system and
your tablet. Screenshots or a short screen recording help a lot.

## Working on the code

```bash
npm install
npm run dev          # the app with hot reload
npm run typecheck && npm test && npm run build   # run before every commit
```

- Electron + React + TypeScript. The board is a custom Canvas 2D engine in
  `src/renderer/src/engine`; React only draws the panels. The main process (`src/main`) handles the
  board library, files and updates.
- Board data stays **vector**. A change to the file format needs a `FORMAT_VERSION` bump in
  `engine/serialize.ts`, and older files must keep opening.
- Saving must stay power-cut safe: write board and library files through `writeDurable`
  (`src/main/fsutil.ts`).
- **Keyboard shortcuts** match the physical key (`KeyboardEvent.code`) so they work on any layout.
  Adding one means updating `src/renderer/src/shortcuts.ts`, `docs/SHORTCUTS.md`,
  `tests/shortcuts.test.ts` and both languages in `i18n.ts`.
- The interface is in **English and Ukrainian**: every new string goes into both in
  `src/renderer/src/i18n.ts`. Code, comments, docs and commit messages are in English.

## Translations

Better wording for the Ukrainian or English interface is welcome: edit `src/renderer/src/i18n.ts`
and open a pull request, or just describe the change in an issue.

## License

By contributing you agree that your work is released under the
[GPL-3.0-or-later](LICENSE) license, like the rest of Inkboard.
