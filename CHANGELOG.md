# Changelog

All notable changes to Inkboard. Downloads for every version are on the
[Releases page](https://github.com/yaroslavyushchenko/inkboard/releases).

## Unreleased

### Added
- Point eraser that cuts lines apart (Eraser options: "Only what it touches"), plus an eraser size slider.
- Laser pointer (L) with a fading red trail that is never saved.
- Hold-to-snap shapes: keep the pen still at the end of a stroke to turn a rough circle, oval, arc,
  rectangle, square or triangle into a clean one. Keep holding and drag to resize it; Shift or a
  finger on the screen makes it perfect (square, circle, equilateral triangle). Everything but the
  arc becomes a regular shape you can stretch or switch afterwards. On/off and hold time
  (1 s by default) in Settings → Board.
- School paper backgrounds: math grid (darker line every 5 cells), handwriting rows and slanted
  copybook lines, on paper and on the chalkboard. Boards using them are saved as format version 9.
- Selected items are tinted and lifted off the board with a soft shadow.
- Bullet and numbered lists in text: Enter continues the list, "- " becomes a bullet.
- Settings → Board → Mouse wheel: scroll or zoom. A touchpad keeps two-finger scrolling and pinch zoom.

### Changed
- New license: Inkboard is now source-available under FSL-1.1-MIT (free to use, study and change for
  anything except a competing product; every release turns MIT after two years). Versions up to 0.9.2
  stay under GPL-3.0-or-later.
- White is no longer in the pen palette (it clashed with the chalkboard's chalk-white ink). Pens saved as
  white switch to black, and white ink, text and formulas already on boards and templates load as black
  (on the chalkboard black is shown as chalk white, so it looks the same there).

## [0.9.2] (2026-11-13)

### Added
- Drag-and-drop toolbar customization with persistent layouts and reusable dividers.
- Individual drawing-instrument buttons and shortcuts for the ruler and both set squares.

### Changed
- Unified the top bar with horizontally scrolling tools.
- Desktop board surfaces follow the interface theme.

## [0.9.1] (2026-11-13)

### Added
- A live whiteboard demo on the website, with a green chalkboard in dark mode.

### Changed
- The React website and the desktop app share the same board editor.

## [0.8.0] (2026-11-13)

### Added
- **Formulas.** A new board object built on an on-screen math keypad: fractions, roots of any degree,
  powers and indices, logarithms, trigonometry, limits, derivatives, integrals, sums, matrices,
  determinants, combinations, Greek letters. Empty slots show as dotted squares; keys with a red dot have
  more variants on a long press (or right click). A formula stays vector, can be moved, scaled, recoloured
  and edited again (double-click). Typing works too: `/` divides (`:` or `÷`, like the keypad's division key), `Alt + /` makes a fraction, `^` a power, `_` an index,
  `sqrt`, `sin`, `pi` turn into their signs. Recent formulas are kept in the keypad's history.
- When a formula is plain arithmetic, a **Show answer** button appears next to it, so the class can work
  it out first. It reveals the value (`= 14`, `≈ 0.3333`); a click on the value (or `Tab`, then `Tab`
  again) adds it to the formula. Trigonometry is in radians; there is a `°` key for degrees.
- The same keypad and field in the **Functions** panel of a coordinate plane. The label next to a curve
  is written exactly as the formula was built. New in formulas of x: factorial, per cent, degrees,
  hyperbolic functions, `sec`, `csc`, `arcctg`.
- **Plot formulas from the board.** Select one formula (`y = x²`, `f(x) = …`, `3t + 1`) or several and
  press the plot button: a coordinate plane appears next to them with all their graphs.
- Functions can have other names and variables: click `y =` in the Functions panel to pick `f(x)`,
  `s(t)`, `v(t)`, a variable `t`, `a`, `n`, `k` or `φ` (the formula is rewritten in it). The axes are
  named after them.
- A curve can be drawn on a range only: `x` from … to … and `y` from … to … under each function (for
  example `√x` from 3 to 7, or a parabola only up to `y = 4`).
- **Equations in x and y** are drawn as curves: a circle `x² + y² = 4`, an ellipse, a hyperbola
  `x·y = 1`, a vertical line `x = 3`, a sideways parabola `x = y²`. Type them in the Functions panel or
  plot them from the board. The left side can also be typed by hand (`s(t) = 2t`, `w(z) = z²`); the
  `y =` button is then hidden, and the formula is kept exactly as written.
- **Fit to graphs**: a button in the Functions panel and on the bar above a plane sets the plane's axes
  to just hold its curves. It grows a plane that is too small as well as shrinking a large one, and
  gives the same result when pressed again. Undoable.

### Changed
- The bar above a selection is icon-only and smaller (names and shortcuts are in the tooltips); its
  popovers (Style, Shape, Save as template) and the text format bar are more compact.
- File format version 7 (formula objects, functions drawn on a range of x or y, equations in x and y). A board without them is still
  saved as version 6, so 0.7.2 keeps opening it; boards with them need this version or newer.

### Fixed
- The selection bar, its popovers and the text format bar could end up partly or fully off screen (near
  a window edge, or with a selection larger than the window). They now always stay inside the window.

## [0.7.2] (2026-11-12)

0.7.0 and 0.7.1 were tagged but never published; 0.7.2 is the first release with these changes.

### Added
- Ruler and two set squares (45°/45°/90° and 30°/60°/90°) with centimetre and millimetre scales
  (`1 cm = 2 paper cells`); drawing along any edge produces a straight segment with a live centimetre readout.
- Dedicated **Drawing tools** dropdown menu on the top toolbar grouping the ruler, both set squares, the
  protractor and the compass, with downward chevron indicators on all dropdown menus.
- Hold `Ctrl` (`⌘` on macOS) while dragging any instrument to snap its origin to paper grid intersections.

### Changed
- Library storage moved from gzipped `.inkboard` files to Node's built-in SQLite (`library.sqlite`, WAL,
  `synchronous = FULL`, schema versioned with `user_version`). Raster images are stored once by SHA-256 hash
  as binary BLOBs. The migration runs in one transaction and moves the old files into `Library/legacy-0.6/`
  instead of deleting them; a re-run after a crash never overwrites migrated boards.
- Every board now lives in the library. "Save as file" exports a copy; opening an `.inkboard` file imports it
  once, and opening the same unchanged file again opens that board instead of a duplicate. Boards that
  0.6 kept in the user's own files are copied into the library (the files stay where they are).
- Standalone `.inkboard` files are now plain UTF-8 JSON (0.6 reads them; gzip files are still read).
- Autosave writes at most 5 seconds after the first unsaved change, also while drawing without pauses
  (and right away on board switch, app close, sleep or `Ctrl+S`).

### Removed
- Built-in version history. Existing snapshots in `Library/history/` are left on disk untouched.

## [0.6.0] (2026-11-12)

### Added
- Function graphs on coordinate planes: up to 8 formulas per plane, typed in a panel beside the plane
  (Graph menu → Function graph…, or the Function button on a selected plane). Curves update as you type;
  formulas are typeset next to the curves and can be hidden. File format version 6.
- Protractor: hover highlight and hints, the degree under the pointer on the edge, snapping of arcs and
  rays to a step set with its new ⚙ handle (off, 1°, 5°, 15°).
- Compass: hover highlight and hints, cell marks on the radius line, arcs snap to quarter turns.

### Changed
- The compass radius always snaps to half cells.
- On narrow windows the top toolbar moves aside or to a second row instead of covering the menu.
- The protractor scale is drawn with fewer canvas calls.

## [0.5.2] (2026-11-11)

### Changed
- The macOS `.dmg` window shows how to install Inkboard and how to open it the first time
  (System Settings → Privacy & Security → Open Anyway).

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

[0.8.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.8.0
[0.7.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.7.0
[0.6.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.6.0
[0.5.2]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.5.2
[0.5.1]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.5.1
[0.5.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.5.0
[0.4.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.4.0
[0.3.1]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.3.1
[0.3.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.3.0
[0.2.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/yaroslavyushchenko/inkboard/releases/tag/v0.1.0
