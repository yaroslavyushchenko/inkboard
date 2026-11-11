**Inkboard** is a free infinite whiteboard for pen tablets.

![Inkboard](https://raw.githubusercontent.com/yaroslavyushchenko/inkboard/main/docs/images/hero.png)

## What's new in 0.5.0

### New
- **Compass (K):** drag ↔ to set the radius (shown in paper cells), then drag the pencil around the
  needle for an arc or a full circle. It draws with the current pen.
- **Protractor arcs get their angle written next to them** ("50°"). A short tip at the bottom explains
  how to use the protractor and the compass (click "Got it" to hide it).
- **Formatted text:** select words (or right-click) → colour, size, **bold**, *italic*, underline.
  Ctrl+B / Ctrl+I / Ctrl+U work too.
- **Edit existing text:** double-click or double-tap with the pen, or select it and press **Edit text**.
- **Any number of sides** (3–24) for the base of a pyramid or prism: type it in the "n =" box.

### Changes
- The hand (move the board) sits next to the selection tools; the Move tool has the usual four-arrow icon.
- Fix: on the "All boards" screen several card menus could be open at once.

Boards saved by 0.5 can't be opened by older versions, so update every computer you use.

## Also in 0.4

- Text, line end dragging, editable shapes, lock, brush select (C), arrows on freehand lines, 3D axes,
  replacing templates. Fix for the pen getting "stuck" moving the board.

## Download

| System | File |
|---|---|
| Windows | `Inkboard-Setup-…-x64.exe` |
| macOS (Intel and Apple Silicon) | `Inkboard-…-mac-universal.dmg` |
| Linux | `.AppImage` (any distro, auto-updates) or `.deb` (Ubuntu / Debian) |

## First launch

The builds are not code-signed yet, so the system will warn you once:

- **Windows:** "Windows protected your PC" → click **More info** → **Run anyway**.
- **macOS:** open the `.dmg`, drag Inkboard to Applications, then **right-click the app → Open → Open**.
  If macOS says the app is damaged, run `xattr -cr /Applications/Inkboard.app` in Terminal.
- **Linux AppImage:** `chmod +x Inkboard-*.AppImage` and run it. On Ubuntu 24.04+ install FUSE 2 first: `sudo apt install libfuse2t64`.

Feedback and bug reports: open an issue in this repository.
