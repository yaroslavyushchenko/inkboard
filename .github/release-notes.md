**Inkboard** is a free infinite whiteboard for pen tablets.

![Inkboard](https://raw.githubusercontent.com/yaroslavyushchenko/inkboard/main/docs/images/hero.png)

## What's new in 0.5.2

- **macOS:** the `.dmg` window now shows how to install Inkboard and how to open it the first time.

## Also in 0.5.1

- **The Linux AppImage starts on Ubuntu 24.04 and newer** without installing anything extra
  (it used to need libfuse2).
- **Version history** saves a snapshot every 5 minutes of editing and keeps the last 36 (about three hours).
- **After restoring a version** the view moves to show the whole board, so it never looks empty.
- New boards are named like "Board of 11 Nov 2026, 18:30".
- Clearer wording in the interface (English and Ukrainian) and a fuller description of the `.deb` package.

## Also in 0.5.0

- **Compass (K):** set the radius, then drag the pencil around the needle for an arc or a full circle.
- Protractor arcs get their angle written next to them ("50°").
- **Formatted text:** select words (or right-click) → colour, size, **bold**, *italic*, underline.
  Double-click text to edit it.
- Any number of sides (3–24) for the base of a pyramid or prism.

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
- **macOS:** open the `.dmg`, drag Inkboard to Applications and open it. macOS says it can't verify the app:
  click **Done**, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
  You only do this once.
- **Linux AppImage:** allow it to run (file Properties → *Executable as Program*, or `chmod +x Inkboard-*.AppImage`) and open it.

Feedback and bug reports: open an issue in this repository.
