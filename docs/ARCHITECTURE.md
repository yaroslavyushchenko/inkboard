# Architecture

Inkboard is moving from one Electron app to a set of layers that the desktop app, a web app and,
one day, a React Native app can share. The move happens in small steps; after each one the app
works and ships as before. This file describes where the code is going and what is already done.

## Layers

```
apps          desktop (Electron, the repository root for now), web, site
  ↓
ui-web        React DOM: toolbar, popovers, math keypad, dialogs, <BoardView/>
  ↓
features      ink, eraser, selection, shapes, shape-recognition, text, images,
              formulas, graphs, instruments, backgrounds, laser
editor        headless editor: createEditor(), tools as controllers, selection, its own store
render        Canvas 2D and SVG behind one Painter interface
  ↓
core, math    the document model and pure math
```

Code only depends on the layers below it. Two things never appear below `ui-web`:

- **React or any other UI.** The editor and the features expose state and actions; each platform
  draws its own interface on top (React DOM for desktop and web; React Native would get its own
  components over the same hooks and models).
- **The DOM, Electron or Node.** Everything platform specific sits behind small interfaces
  (ports) that each app fills in: board storage, files, clipboard, updates, preferences.

## Packages

Workspace packages live in `packages/` and are imported by name with a module path, for example
`@inkboard/core/scene`. Each package exports its source files directly (`"exports": { "./*":
"./src/*.ts" }`); there is no build step.

| Package | What it holds | Depends on |
|---|---|---|
| `@inkboard/math` | Formula trees and editing (the keypad model), lexer, parser, evaluator | nothing |
| `@inkboard/core` | Item types, scene with undo and redo, camera, geometry, shape outlines, point erasing | math |
| `@inkboard/shape-recognition` | Hold-to-snap: recognises circles, ovals, arcs, rectangles, squares and triangles in a stroke | core |

Still in `src/board/engine` until their own steps: rendering (`renderer.ts`, `ink.ts`, `background.ts`,
`surface.ts`, `export.ts`), text layout, formula typesetting, graphs and the drawing instruments.
They mix pure logic with Canvas calls, so they move together with the Painter step.

## State

Three stores, each with one owner:

| Store | Where | What | Lifetime |
|---|---|---|---|
| Preferences | `src/board/store.ts` (`prefsStore`, `usePrefs`) | pens, colours, language, theme, toolbar layout | shared by all boards, saved between launches |
| Session | `src/board/session.ts` (`editor.session`, `useSession`) | tool, selection, camera, instruments, text or formula being edited | one per open board |
| App | `src/renderer/src/appState.ts` (`useApp`) | screen, open board, save status, library, updates | the desktop app only |

There is no global editor. The app makes one with `createEditor()` and passes it to
`<BoardWorkspace editor={...}>`, which provides it to the board UI (`useEditor()`). The board
never reads the app store: the app tells it whether it is on screen through `session.active`.

## Rules the build checks

`npm run typecheck` fails when a rule is broken:

1. **No DOM and no Node in packages.** Every package is type-checked on its own with
   `packages/tsconfig.base.json`, which has only the ECMAScript library: `document`, `window`,
   `HTMLCanvasElement` or `process` don't exist there.
2. **Declared dependencies only.** `scripts/check-boundaries.mjs` checks that a package imports only
   its own files and the packages listed in its `package.json`, that packages have no cycles, that
   app code imports packages by name and that the site imports no app code.

## Storage

The board library lives in different databases on different platforms, behind the same
interfaces (repositories), so the editor and the UI never know which one is used:

| Platform | Library (boards, thumbnails, tags, templates) | `.inkboard` files |
|---|---|---|
| Desktop | SQLite (`node:sqlite`) in the Electron main process, reached over IPC | native open and save dialogs |
| Web | IndexedDB in the page, images as Blobs, `navigator.storage.persist()` | File System Access API, or download and upload |
| Tests | in memory | in memory |

- **Repositories, not an ORM.** IndexedDB is not SQL, and no ORM covers both well. Each platform
  implements the repository interfaces directly; a cloud sync adapter would be one more.
- **Files are a separate port.** Opening, saving, "show in folder" and "open with" are about the
  file system, not the library database, so they don't belong in the library interface
  (`LibraryApi` in `src/shared/platform.ts` still mixes the two; the web step splits it).
- **One set of contract tests** runs against every adapter (SQLite, IndexedDB through
  `fake-indexeddb`, memory), so all of them behave the same.
- Saving stays power-cut safe on every platform: `writeDurable` and SQLite transactions on the
  desktop, IndexedDB transactions in the browser.

## Patterns, and where they are used

Only where there are really two or more ways to do something:

- **Ports and adapters**: storage, files, updates and the clipboard behind interfaces
  (`src/shared/platform.ts` today), with an Electron adapter, a browser adapter and an in-memory
  one for tests.
- **Command**: every change to a board is a plain, serialisable operation. That gives undo and redo
  today and a path to syncing boards later.
- **State machines for tools**: each tool handles pointer down, move, up and cancel on its own,
  instead of one big event handler.
- **Strategy**: shape recognisers, ways to plot a graph, eraser modes, export formats, storage.
- **Registry**: features register their item types, tools, commands, texts and shortcuts; a
  feature that is switched off is simply not registered.
- **Composition root**: `createEditor({ features, platform, preferences })` instead of a global
  editor, so a page can hold several boards and tests need no DOM.

## Steps

1. Done: workspace packages for math, core and shape recognition, with the checks above.
2. Done: `createEditor()` instead of the global `editor`; the UI store split into preferences,
   board session and app state.
3. Move the tool logic out of `src/board/ui/Board.tsx` into tool controllers in the editor.
4. Painter: one drawing interface for Canvas 2D and SVG export; rendering moves into a package.
5. Features as modules with a registry, starting with shape recognition.
6. A web app with browser storage (IndexedDB) and files through the File System Access API.
