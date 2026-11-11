# Changelog

All notable changes to Inkboard. Downloads for every version are on the
[Releases page](https://github.com/yaroslavyushchenko/inkboard/releases).

## [0.5.1] (2026-11-11)

### Changed
- Version history saves a snapshot every 5 minutes of editing (the last 36 are kept).
- After restoring a version, the view moves to show the whole board.
- New boards are named like "Board of 11 Nov 2026, 18:30".

### Fixed
- The AppImage starts on Ubuntu 24.04 and newer without installing libfuse2.
- A fuller description of the `.deb` package in Ubuntu App Center.

## [0.5.0] (2026-11-11)

### Added
- **Compass (K):** drag ↔ to set the radius (shown in paper cells), then drag the pencil around the
  needle for an arc or a full circle. It draws with the current pen.
- Protractor arcs get their angle written next to them ("50°"); a short tip explains the protractor
  and the compass.
- **Formatted text:** select words (or right-click) → colour, size, bold, italic, underline;
  Ctrl+B / Ctrl+I / Ctrl+U.
- Edit existing text: double-click / double-tap with the pen, or **Edit text** on the selection bar.
- Any number of sides (3–24) for the base of a pyramid or prism.

### Changed
- The hand (move the board) sits next to the selection tools; the Move tool has a four-arrow icon.

### Fixed
- Several card menus on the "All boards" screen could be open at once.

Boards saved by 0.5 can't be opened by older versions.

## [0.4.0] (2026-11-11)

### Added
- Text tool; pasting text puts it on the board.
- Drag the ends of straight lines to change length and angle (whole degrees around the protractor).
- Edit shapes after drawing: side handles and the **Shape** button; pyramids and prisms with 3–6-sided bases.
- Lock items or groups.
- Brush select (C).
- Line ends on freehand lines and any line width.
- 3D coordinate axes.
- Replace a template with the current selection.

### Fixed
- The pen could get "stuck" moving the board after being lifted outside the window.
- Resizing in the Move tool; the eraser removes a whole shape.

## [0.3.1] (2026-11-11)

### Added
- Protractor (T), 3D shapes with dashed hidden edges, line styles and line ends.
- Move tool (M), configurable pen buttons with a tester, X swaps pen ↔ eraser.
- Keyboard shortcuts work on any keyboard layout.
- App version in the menu; "Updated to …" notice.

## [0.3.0] (2026-11-11)

### Added
- Straight lines with Shift; a Shapes menu.
- Number lines and coordinate planes with custom presets.
- Templates; group / ungroup (Ctrl+G / Ctrl+Shift+G).
- Automatic updates on Windows and Linux AppImage.

## [0.2.0] (2026-11-11)

### Added
- Power-cut safe autosave of every board.
- "All boards" screen with previews, search, pins and colour tags.
- Version history and Recently deleted (30 days).
- Save as file, export to PNG / PDF, backup folder.
- Opening `.inkboard` files from the file manager.

## [0.1.0] (2026-11-11)

First test build: infinite board, pressure-sensitive vector ink, eraser, paper backgrounds, images,
lasso selection.

[0.5.1]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.5.1
[0.5.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.5.0
[0.4.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.4.0
[0.3.1]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.3.1
[0.3.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.3.0
[0.2.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.1.0
