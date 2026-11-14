# Architecture

Inkboard is moving from one Electron app to a set of layers that the desktop app, a web app and,
one day, a React Native app can share. The move happens in small steps; after each one the app
works and ships as before. This file describes where the code is going and what is already done.

## Layers

```
apps          desktop (Electron, the repository root for now), web (apps/web), site
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
| `@inkboard/render` | Display lists (what to draw, as data) and their SVG form | nothing |
| `@inkboard/render-canvas` | Draws display lists on a Canvas 2D context; the only package with the DOM types | render |

Still in `src/board/engine`: the board renderer and exports (`renderer.ts`, `export.ts`), ink,
text layout, formula typesetting, graphs, backgrounds and the drawing instruments. They move into
packages as each one draws through a display list (below).

## Drawing: display lists

An item describes how it looks as a display list (`@inkboard/render/display`): lines, polylines,
polygons, text and groups, with the item's own colours. Backends draw it: `@inkboard/render-canvas`
on screen and in PNG exports, `toSvg` for SVG and PDF exports, Skia one day for React Native. One
description, so the screen and the exports can't drift apart, and lists are cached per item object
(items are replaced, never changed in place). Colours are mapped while drawing (`inkColors` in
`engine/surface.ts`), so one list serves paper and the chalkboard.

Drawn this way: graphs (`graphDisplay`) and formulas (`formulaDisplay`); `tests/display.test.ts`
checks their SVG against what the earlier code wrote. Still with separate canvas and SVG code:
ink strokes, text and images.

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

## Feature modules

What Inkboard can do comes in modules (`src/board/modules`), registered when the app creates an
editor: `createEditor({ modules: builtinModules })`. The board's core reaches them only through the
registry (`src/board/registry.ts`, `editor.features`):

| Module | Brings |
|---|---|
| `ink` | stroke items (pen, highlighter, lines, shapes) |
| `images` | image items |
| `text` | text items |
| `graphs` | graph items (number lines, planes, 3D axes) and their plots |
| `formulas` | formula items, and the answer worked out while a formula is typed |
| `shape-recognition` | hold-to-snap: a stroke held still becomes the clean shape it resembles |

- The renderer, thumbnails and every export draw items with `editor.features.draw / svg`; none of
  them switch on the item type any more.
- The pen asks `features.strokeRecognizer` and the formula editor `features.formulaEvaluator`;
  without the module the behaviour (and its setting) is simply not there.
- A module that owns an item type is needed to show such items, so keep item modules in and switch
  a feature off in its UI (a feature flag) instead.
- Still to move into modules: each module's UI (keypad, graph dialog, insert menus), its tools,
  shortcuts and texts, and per-type logic in `transform.ts` and `serialize.ts`.

## Tools

Each tool is a controller in `src/board/tools/` (`types.ts` has the interfaces). The board component
turns DOM pointer events into `Sample`s (screen and board position, pressure, time) and hands them to
the tool that started the gesture; the tool changes the scene and the session and commits on release.
Tools never touch the DOM, so they are unit-tested without one (`tests/tools.test.ts`) and a React
Native board could drive the same ones.

Moved so far: eraser (stroke and point), brush select, laser. Still in `src/board/ui/Board.tsx`:
pen and highlighter (with hold-to-snap and drawing along instruments), the shape tool, lasso, move
and scale, line end handles, the drawing instruments, text, and touch pan and pinch.

## Rules the build checks

`npm run typecheck` fails when a rule is broken:

1. **No DOM and no Node in packages.** Every package is type-checked on its own with
   `packages/tsconfig.base.json`, which has only the ECMAScript library: `document`, `window`,
   `HTMLCanvasElement` or `process` don't exist there. The one exception is `render-canvas`, whose
   tsconfig adds the DOM library because drawing on a canvas is its whole job.
2. **Declared dependencies only.** `scripts/check-boundaries.mjs` checks that a package imports only
   its own files and the packages listed in its `package.json`, that packages have no cycles, that
   app code imports packages by name and that the site imports no app code.

## Storage

The board library lives in different databases on different platforms, behind the same
interfaces (repositories), so the editor and the UI never know which one is used:

| Platform | Library (boards, thumbnails, tags, templates) | `.inkboard` files |
|---|---|---|
| Desktop | SQLite (`node:sqlite`) in the Electron main process (`src/main/library.ts`), reached over IPC | native open and save dialogs; a saved file is the board |
| Web | IndexedDB in the page (`src/renderer/src/web/library.ts`), `navigator.storage.persist()` after the first save | File System Access API, or download and upload (`web/files.ts`); a saved file is a copy |

- **Repositories, not an ORM.** IndexedDB is not SQL, and no ORM covers both well. Each platform
  implements the repository interfaces directly; a cloud sync adapter would be one more.
- **Files are a separate port.** Opening, saving, "show in folder" and "open with" are about the
  file system, not the library database: `BoardStoreApi` and `BoardFilesApi` in
  `src/shared/platform.ts`. The app shell sees both together as `LibraryApi`.
- **One set of contract tests** (`tests/libraryContract.ts`) runs against every store: SQLite
  (`desktopLibraryContract.test.ts`) and IndexedDB through `fake-indexeddb` (`webLibrary.test.ts`),
  so both behave the same. A new store (a cloud one, say) gets the same suite.
- Saving stays power-cut safe on every platform: `writeDurable` and SQLite transactions on the
  desktop, IndexedDB transactions in the browser.

## Patterns, and where they are used

Only where there are really two or more ways to do something:

- **Ports and adapters**: storage, files and updates behind `PlatformApi`
  (`src/shared/platform.ts`), with the Electron adapter (preload) and the web one
  (`src/renderer/src/web/platform.ts`); `src/renderer/src/platform.ts` picks one.
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
3. In progress: move the tool logic out of `src/board/ui/Board.tsx` into tool controllers
   (eraser, brush select and laser are done).
4. Done: the web app (`apps/web`, published at `/inkboard/app/`): the desktop app shell with the web
   platform, IndexedDB storage, file pickers, print to PDF, and a service worker for offline use.
5. In progress: display lists for drawing on screen and in exports (graphs and formulas done; ink,
   text and images next), then the renderer moves into a package.
6. In progress: features as modules with a registry (drawing, shape recognition and formula answers
   done; UI, tools, shortcuts, transforms and file format next).
7. The remaining tools out of `Board.tsx`.
