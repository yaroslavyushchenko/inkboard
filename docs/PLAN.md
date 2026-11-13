# Inkboard project plan

Working name: **Inkboard** (easy to rename). Goal: a free, source-available (FSL-1.1-MIT) replacement for
the discontinued Microsoft Whiteboard: an infinite canvas for stylus drawing that feels as close to it as
possible. Primary user: a school teacher with a pen tablet (Windows) who writes assignments for students.

Local-only for now; no online features yet.

## Key requirements

1. **Ink is vector data.** Every stroke is stored as a list of points `[x, y, pressure]` in world
   coordinates, never as pixels. The outline is rebuilt for the current zoom on every render, so lines
   stay sharp at any magnification. SVG/PDF export will be vector too. Only the screen is rasterized.
2. **Images.** Paste (Ctrl+V), drag-and-drop or the toolbar button. An image is a separate board object
   kept at its original resolution (never recompressed); you can draw on top of it.
3. **Stylus.** Pressure, eraser end of the pen, hover indicator, palm rejection.
4. **Background** of choice: blank / dots / grid / ruled lines.
5. **Languages:** English (default) and Ukrainian. No Russian localization.

## Stack

| What | With | Why |
|---|---|---|
| Shell | Electron | cross-platform: Windows (the teacher), Linux, macOS |
| Build | electron-vite + Vite | one config for main / preload / renderer, fast HMR |
| UI | React + TypeScript | panels, popovers, settings |
| UI state | zustand | tiny, no boilerplate |
| Drawing | Canvas 2D, custom engine | full control over pen input and latency |
| Pressure ink | perfect-freehand (MIT) | nice variable-width ink outlines |
| Packaging | electron-builder | .exe installer (NSIS), AppImage / .deb |

The board is not rendered through React: the engine lives in `src/board/engine`, React only does
the chrome. Two canvas layers: the bottom one holds paper + committed items, the top one holds the stroke
in progress and the pen cursor (so drawing never forces a full board redraw).

## Stages

### Stage 0: scaffold
- [x] Electron + Vite + React + TS, main / preload / renderer layout
- [x] GPL-3.0 LICENSE, README, git repository

### Stage 1: board core (MVP)
- [x] Infinite canvas: camera (x, y, zoom), pan and zoom in any direction
- [x] Pan: wheel / touchpad, middle or right mouse button, Space + drag, one finger
- [x] Zoom: Ctrl + wheel, touchpad pinch, two-finger pinch, −/+ buttons, Ctrl+0
- [x] Background: blank / dots (dot pad, barely visible grey dots) / grid / ruled lines
- [x] Pen with pressure (Pointer Events + getCoalescedEvents for smoothness)
- [x] Highlighter (translucent)
- [x] Whole-stroke eraser (like Whiteboard)
- [x] Pen eraser end and barrel button → eraser
- [x] Pen hover indicator (pen near the surface but not touching yet)
- [x] Palm rejection: finger touches are ignored while the pen is active
- [x] Undo / Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- [x] Images: Ctrl+V, drag a file into the window, toolbar button (original quality)
- [x] i18n: English + Ukrainian

### Stage 2: Whiteboard-like UI
- [x] Floating ink toolbar: 3 pens, highlighter, eraser, undo/redo
- [x] Pen popover: colour palette + thickness
- [x] Zoom control bottom-right
- [x] Lasso selection: move, scale, delete, duplicate, copy/cut/paste (ink and images)
- [x] Point eraser (splits strokes), eraser size
- [x] Ruler and set squares (draw straight lines along them)
- [x] Laser pointer (fading trail, handy for showing things to students)
- [x] Dark interface theme and green chalkboard
- [x] Setting: mouse wheel = scroll or zoom
- [x] Settings menu (wheel behaviour, shape-snap delay)
- [x] Pens, colours, language and background remembered between launches

### Stage 3: files & library (v0.2)
- [x] Save / open a board (`.inkboard`: gzip JSON, images stored once as assets)
- [x] Board library with thumbnails: home screen ("All boards"), search, pinned boards, colour tags
- [x] Drafts live in the app's hidden library folder; explicitly saved files are tracked and
      **autosaved into the file itself**
- [x] Power-loss-safe autosave: fsync + atomic rename + `.bak`, saves within ≤5 s even while drawing,
      flush on close / sleep / shutdown; corrupt file → automatic fallback to `.bak`
- [x] Version history: snapshot every 5 min of editing (last 36), restore is undoable (Ctrl+Z)
- [x] Recently deleted (30 days, one-click restore)
- [x] Open `.inkboard` from the OS (double-click / "Open with"), single app instance
- [x] Export PNG and vector PDF (whole board or selection)
- [x] Optional backup folder (USB stick / cloud-synced folder), mirrored automatically
- [x] Migration of the 0.1 autosave into the library

### Stage 3.5: teaching tools & updates (v0.3)
- [x] Shift = straight line (snaps to 0°/45°/90°), for pen and highlighter
- [x] Shapes menu: line, arrows, rectangle, ellipse, triangles, rhombus, parallelogram, trapezoid,
      pentagon, hexagon, star, cube (drag to size, click = default size, Shift = proportional)
- [x] Coordinate line / plane: presets with previews, custom ranges & unit length, own presets,
      editable after insertion; axes only (the paper background is the grid)
- [x] Templates: save any selection (e.g. "Given / Find / Solution") and insert it into any board
- [x] Group / ungroup (Ctrl+G / Ctrl+Shift+G, buttons on the selection bar)
- [x] Move tool (M): hover highlight, drag anything (or its group) directly
- [x] Pen buttons: configurable lower / upper side button and eraser end, with a live tester
- [x] Shortcuts help with a Wacom ExpressKeys guide; X swaps pen ↔ eraser
- [x] Shortcuts work on any keyboard layout (one registry `shortcuts.ts`, contract test `npm test`)
- [x] Protractor (T): move / rotate / resize; draw arcs along the edge, angle rays from the centre
- [x] Line styles: solid / dashed / dotted; line ends (arrow, dot, circle, bar); restyle a selection
- [x] 3D solids with dashed hidden edges: cube, prism, pyramid, cylinder, cone, sphere
- [x] Version shown in the menu, home screen and Settings; "Updated to X" notice; download progress
- [x] Auto-update from GitHub Releases (Windows, AppImage); "new version" notice on macOS / .deb

### Stage 3.6: editing (v0.4)
- [x] Fix: resize handles work in the Move tool too (they used to move instead)
- [x] Fix: a pen release outside the board no longer leaves the board "stuck" panning
- [x] Pen buttons: no "move" actions any more (use a Space keystroke in the Wacom driver to pan)
- [x] Drag the end points of straight lines; snaps to whole degrees on the protractor, Shift = 15°
- [x] Shapes remember how they were made: stretch with side handles, switch kind / base afterwards
- [x] Pyramids and prisms with a 3-, 4-, 5- or 6-sided base
- [x] Eraser removes a whole shape, not single edges
- [x] Lock items / groups (no erase, delete, move, resize or restyle until unlocked)
- [x] Line ends on freehand ink; any line width via a slider
- [x] Text tool (click and type, double-click to edit, paste text); 3D coordinate axes
- [x] Focus: picking a drawing tool clears the selection; toolbar buttons / sliders don't keep keyboard focus
- [x] Brush select (C): circle cursor, wheel = size, touched items are added (Ctrl / Alt removes)
- [x] Replace a template's content with the selection (explicit confirmation step)

### Stage 3.7: text and drawing aids (v0.5)
- [x] Formatted text: select words (or right-click) → colour, size, bold, italic, underline; Ctrl+B / I / U
- [x] Edit existing text: double-click / double-tap (pen too) or "Edit text" in the selection bar
- [x] Pyramids and prisms with any number of sides for the base (3–24)
- [x] Compass (K): set the radius in paper cells, draw arcs / circles around the needle
- [x] Protractor arcs get their angle written next to them; how-to tips for both instruments
- [x] Toolbar: hand (pan) next to the selection tools; four-way arrows for the Move tool

### Stage 3.8: formulas (v0.8)
- [x] Formula object built on an on-screen math keypad (four tabs + letters, long-press variants, history):
      fractions, roots, powers, logarithms, trigonometry, limits, derivatives, integrals, sums, matrices
- [x] One grammar for typed and keypad formulas: lexers (`mathlex.ts`, `formulalex.ts`) → parser
      (`mathparse.ts`) → evaluator (`mathexpr.ts`); numeric result offered for plain arithmetic
- [x] The keypad in the Functions panel of a coordinate plane
- [x] Plot selected formulas on a new plane; function names and variables (`s(t)`), ranges of x and y (`from`/`to`)
- [x] Equations in x and y as curves (marching squares, `plotImplicit`); fit a plane to its graphs
- [x] The value of an arithmetic formula is hidden behind "Show answer"
- [x] Selection bar and its popovers always stay inside the window; compact, icon-only bar

### Stage 4: content
- [x] **Hold-to-snap shapes**: hold the pen still ~1 s (configurable) at the end of a stroke → a rough
      circle, oval, arc, rectangle, square or triangle becomes a clean, level one (board shapes, except
      the arc); keep holding and drag to resize; Shift / a finger = perfect. Nothing else snaps: lines,
      arrows, zigzags and turned shapes were tried and dropped as unreliable.
- [x] Bullet and numbered lists in text (sticky notes were tried and dropped)
- [x] School paper backgrounds: math grid, handwriting rows, slanted copybook lines (format 9)

### Stage 5: release
- [ ] Final name
- [x] Installers: Windows (NSIS), macOS, Linux (AppImage, .deb)
- [x] GitHub Actions: build for every OS on each tag, auto-update feed
- [ ] Later: performance for very large boards (tile cache, R-tree spatial index). Not needed yet;
      revisit when big boards start to feel slow.

### Later, for fun
- [ ] Online collaboration (CRDT, e.g. Yjs)

## Notes on pen input and hover

- Pointer Events give `pointerType === 'pen'`, `pressure`, tilt and pen buttons.
- While the pen hovers above the tablet without touching, `pointermove` arrives with `buttons === 0`,
  and we draw the cursor with a halo. When the pen leaves the detection range, `pointerleave` hides it.
- Web APIs do **not** expose the pen's distance to the surface, only "in range / out of range". So the
  "approaching" highlight is a halo shown while the pen is within the tablet's sensing range.
- On Linux under Wayland, if pressure doesn't work, run with `--ozone-platform=x11` (`npm run dev:x11`).
