# Inkboard

A free, open-source infinite whiteboard for pen tablets — inspired by the feel of Microsoft Whiteboard.
Built for teachers who write and draw with a stylus.

- Infinite canvas: pan and zoom in any direction
- Pressure-sensitive **vector** ink — stays sharp at any zoom
- Pens, highlighter, stroke eraser (pen eraser end / barrel button supported)
- Pen hover indicator, palm rejection
- Paper backgrounds: blank, dots, grid, lines
- Images: paste, drag & drop, or insert from file
- Lasso selection: move, scale, duplicate, copy/paste
- **Never lose work:** every board autosaves within seconds (power-cut safe), with version history
- Board library with thumbnails, search, pins and colour tags; Recently deleted
- Export to PNG or vector PDF; optional automatic backup folder
- Shift for straight lines, a shapes menu (solids with a choice of base, editable after drawing),
  coordinate lines / planes / 3D axes for maths, a protractor
- Drag the ends of a straight line to change its length and angle (whole degrees on the protractor)
- Line ends (arrow, dot…) on any line, including freehand; any line width via a slider
- Text: click and type, or paste text
- Lock items or groups so they can't be erased, moved or deleted by accident
- Templates: save any part of a board and insert it into other boards
- Automatic updates
- English and Ukrainian UI

Status: early development. See [docs/PLAN.md](docs/PLAN.md) for the roadmap.

## Development

Requires Node.js (LTS or newer).

```bash
npm install
npm run dev        # start the app with hot reload
npm run dev:x11    # Linux/Wayland: use this if pen pressure doesn't work
npm run typecheck
npm run build
```

> npm 11+ may skip Electron's install script. If `npm run dev` says Electron failed to install,
> run `node node_modules/electron/install.js` once.

## Controls

| Action | Input |
|---|---|
| Draw | pen / left mouse button |
| Erase | eraser tool, pen eraser end, or pen barrel button |
| Pan | wheel / touchpad scroll, middle or right mouse drag, Space + drag, one finger |
| Zoom | Ctrl + wheel, touchpad pinch, two-finger pinch, Ctrl + / Ctrl − / Ctrl+0 |
| Tools | 1 / 2 / 3 pens, H highlighter, E eraser |
| Undo / Redo | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Insert image | Ctrl+V, drag a file in, or the toolbar button |
| Lasso select | V; Del deletes, Ctrl+D duplicates, Ctrl+C / Ctrl+V copy & paste |
| Straight line | hold Shift while drawing |
| Group / ungroup | Ctrl+G / Ctrl+Shift+G |
| Change a line's angle / length | select it (V or M) and drag one of its round end handles |
| Stretch a shape | select it and drag a side handle; *Shape* on the selection bar changes kind / base |
| Text | **T** button in the toolbar: click and type, Esc when done; double-click text to edit |
| Lock / unlock | *Lock* on the selection bar |
| Move tool (drag anything) | M |
| Swap pen ↔ eraser | X |
| All boards | Ctrl+H |
| New board / Open file | Ctrl+N / Ctrl+O |
| Save as file | Ctrl+S (draft) or Ctrl+Shift+S |

## Linux AppImage note

Ubuntu 24.04 and newer don't ship the FUSE 2 library AppImages need. Install it once:

```bash
sudo apt install libfuse2t64
```

(or use the `.deb` package instead).

## Wacom tablets

- **Pen side buttons:** in Wacom Center set the lower switch to *Right click* and the upper to *Middle click*;
  then choose what each does in Inkboard (Settings → Pen buttons: eraser, lasso, or the current tool).
  To move the board with a pen button, give it the *Space* keystroke instead (hold = move).
  The settings panel has a tester that shows which button Inkboard receives.
- **ExpressKeys** on the tablet are configured in Wacom Center as *Keystroke…* — e.g. Ctrl+Z, X, V, M, Space.
  Settings → *Keyboard shortcuts & Wacom ExpressKeys* lists every shortcut.

## Where boards are stored

- Boards you never saved as a file live in the app's data folder
  (`%APPDATA%/Inkboard/Library` on Windows, `~/.config/Inkboard/Library` on Linux,
  `~/Library/Application Support/Inkboard/Library` on macOS).
- "Save as file…" turns a board into a normal `.inkboard` file anywhere you like; it keeps
  autosaving into that file.
- Every write is crash-safe (temp file + fsync + atomic rename, previous version kept as `.bak`).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Download

Installers for Windows, macOS and Linux are on the [Releases](https://github.com/yaroslavyushchenko/inkboard/releases) page.

## Building installers

```bash
npm run dist:linux   # AppImage + .deb
npm run dist:win     # Windows NSIS installer (best built on Windows / CI)
npm run dist:mac     # macOS .dmg (must be built on a Mac / CI)
```

Releases are built by GitHub Actions: push a tag like `v0.1.0` and the
[Release workflow](.github/workflows/release.yml) builds every platform and publishes a release.
