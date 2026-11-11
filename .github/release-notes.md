**Inkboard** — a free infinite whiteboard for pen tablets.

## What's new in 0.4.0

### Fixes
- **The pen no longer gets "stuck" moving the board.** If the pen was lifted over a panel or outside the
  window, every pen movement kept moving the board until the app was restarted. Fixed.
- **Resizing works in the Move tool (M)** — the corner handles used to move the selection instead.
- Pen buttons can no longer be set to "move"; to move the board with a pen button, give it the
  **Space** keystroke in Wacom Center (hold = move).
- The eraser removes a **whole shape**, not single edges.
- Picking a pen or another drawing tool clears the selection; toolbar buttons don't keep keyboard focus.

### New
- **Text** (T button in the toolbar): click and type, Esc when done, double-click text to edit.
  Pasting text puts it on the board.
- **Drag the ends of straight lines** to change length and angle — around the protractor centre it turns
  in whole degrees, with the angle shown.
- **Edit shapes after drawing:** stretch with the side handles, or press **Shape** to change the kind.
  **Pyramids and prisms** with a triangle, square, pentagon or hexagon as base.
- **Lock** items or groups (selection bar) so they can't be erased, moved or deleted by accident.
- **Brush select (C):** a circle cursor — everything it touches is selected; mouse wheel changes its size.
- **Arrow / dot ends on freehand lines** too, and **any line width** with a slider.
- **3D coordinate axes** (x, y, z) in the Coordinates menu.
- **Replace a template** with the current selection (asks for confirmation first).

Boards saved by 0.4 can't be opened by older versions — update every computer you use.

## Also in 0.3

- Protractor, 3D shapes, line styles, move tool, shortcuts on any keyboard layout, templates, grouping.
- **Automatic updates** on Windows and Linux AppImage — from 0.3.0 on, new versions install themselves.

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
