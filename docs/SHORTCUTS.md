# Keyboard shortcuts

Single source of truth in code: [`src/renderer/src/shortcuts.ts`](../src/renderer/src/shortcuts.ts).
The in-app dialog (Settings → *Keyboard shortcuts & Wacom ExpressKeys*) is generated from it, and
[`tests/shortcuts.test.ts`](../tests/shortcuts.test.ts) checks every line below (`npm test`).

Shortcuts match the **physical key**, so they work on any keyboard layout (Ukrainian, German, …).
On macOS, Ctrl = ⌘.

**Never change or remove an existing shortcut without asking** — teachers and Wacom ExpressKeys
depend on them. New shortcuts: add to `shortcuts.ts`, this file, the test and both translations.

## Tools

| Keys | Action |
|---|---|
| 1 | Pen 1 |
| 2 | Pen 2 |
| 3 | Pen 3 |
| P | Pen (last used) |
| H | Highlighter |
| E | Eraser |
| X | Swap pen ↔ eraser |
| V | Lasso select |
| M | Move items (hover highlights, drag to move) |
| T | Show / hide protractor |
| Space (hold) | Move the board |

## Editing

| Keys | Action |
|---|---|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Shift (hold while drawing) | Straight line (snaps to 0° / 45° / 90°) |
| Ctrl+G | Group |
| Ctrl+Shift+G | Ungroup |
| Ctrl+D | Duplicate |
| Del (or Backspace) | Delete selection |
| Esc | Deselect / close |
| Ctrl+A | Select all |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste (also pastes images) |

## View & boards

| Keys | Action |
|---|---|
| Ctrl + | Zoom in (also Ctrl+=, numpad +) |
| Ctrl − | Zoom out |
| Ctrl+0 | Zoom 100% |
| Ctrl+H | All boards (home) |
| Ctrl+N | New board |
| Ctrl+O | Open file |
| Ctrl+S | Save (asks for a file the first time; afterwards it autosaves) |
| Ctrl+Shift+S | Save as file (new location) |

## Pen and mouse buttons

| Input | Action |
|---|---|
| Pen lower side button | Eraser by default (Settings → Pen buttons) |
| Pen upper side button | Move the board by default |
| Pen eraser end | Eraser by default |
| Mouse middle / right button drag | Move the board |
| Mouse wheel / touchpad | Scroll; Ctrl + wheel or pinch zooms |
