**Inkboard** — a free infinite whiteboard for pen tablets.

## What's new in 0.3

- **Straight lines:** hold **Shift** while drawing (snaps to horizontal / vertical / 45°).
- **Shapes** menu: lines, arrows, rectangle, circle, triangles, rhombus, parallelogram, trapezoid, polygons, star, cube.
  Drag to draw, click for a default size, Shift keeps proportions.
- **Coordinates:** number lines and coordinate planes with previews; set your own ranges and unit length,
  save your own presets, change them after inserting (gear button on the selection).
- **Templates:** select anything (e.g. "Given / Find / Solution"), press the bookmark button — and insert it into any board later.
- **Group / ungroup:** select several things and press **Ctrl+G** (or the Group button) — they move and scale together. **Ctrl+Shift+G** ungroups.
- **Automatic updates:** from this version on, Inkboard updates itself on Windows and Linux (AppImage).
  On macOS and .deb you get a notice with a download link.

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
- **Linux AppImage:** `chmod +x Inkboard-*.AppImage` and run it.

Feedback and bug reports: open an issue in this repository.
