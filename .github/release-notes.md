**Inkboard** — a free infinite whiteboard for pen tablets.

## What's new in 0.3.1

- **Protractor** (button in the toolbar or **T**): drag to move, ↻ to rotate and resize. Draw along its edge for an arc with
  the angle shown, from the centre for a ray at an exact angle, along the bottom for a straight line.
- **3D shapes** with dashed hidden edges: cube, prism, pyramid, cylinder, cone, sphere (Shapes menu, below the flat shapes).
- **Line styles:** solid, dashed or dotted lines, and line ends — arrow, dot, circle, bar (pen menu).
  Select lines and press **Style** to change colour, width, pattern or ends afterwards.
- **Move tool (M):** hover over anything — it lights up — and just drag it. Dragging empty space moves the board.
- **Pen buttons:** Settings → *Pen buttons* — choose what the side buttons and the eraser end do, with a tester.
- **Keyboard shortcuts work on any keyboard layout** (e.g. Ukrainian). Full list: Settings → *Keyboard shortcuts & Wacom ExpressKeys*.
- **X** swaps pen ↔ eraser (great for a tablet ExpressKey).
- Coordinates: shorter preset names; a clear **Settings** button on a selected coordinate system.
- The app version is shown in the menu and on the board list; after an update you see "Updated to …".

## Also in 0.3

- **Straight lines** with Shift, a **Shapes** menu, **coordinate lines / planes**, **templates**, **group / ungroup** (Ctrl+G).
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
