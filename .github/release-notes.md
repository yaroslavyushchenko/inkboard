**Inkboard** — a free infinite whiteboard for pen tablets.

## What's new in 0.3.1

- **Move tool (M):** hover over anything — it lights up — and just drag it. Works with mouse and pen; dragging empty space moves the board.
- **Pen buttons:** Settings → *Pen buttons* — choose what the lower / upper side button and the eraser end do
  (eraser, lasso, move items, move the board). A tester shows what your pen sends.
- **Keyboard shortcuts & Wacom ExpressKeys** guide in Settings; **X** swaps pen ↔ eraser (great for a tablet button).

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
