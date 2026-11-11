# Inkboard — project plan

Working name: **Inkboard** (easy to rename). Goal: a free, open-source (GPL-3.0-or-later) replacement for
the discontinued Microsoft Whiteboard — an infinite canvas for stylus drawing that feels as close to it as
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

The board is not rendered through React: the engine lives in `src/renderer/src/engine`, React only does
the chrome. Two canvas layers: the bottom one holds paper + committed items, the top one holds the stroke
in progress and the pen cursor (so drawing never forces a full board redraw).

## Stages

### Stage 0 — scaffold
- [x] Electron + Vite + React + TS, main / preload / renderer layout
- [x] GPL-3.0 LICENSE, README, git repository

### Stage 1 — board core (MVP)
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

### Stage 2 — Whiteboard-like UI
- [x] Floating ink toolbar: 3 pens, highlighter, eraser, undo/redo
- [x] Pen popover: colour palette + thickness
- [x] Zoom control bottom-right
- [x] Lasso selection: move, scale, delete, duplicate, copy/cut/paste (ink and images)
- [ ] Point eraser (splits strokes), eraser size
- [ ] Ruler (draw straight lines along it)
- [ ] Laser pointer (fading trail — handy for showing things to students)
- [ ] Dark board theme (classic green/black chalkboard)
- [ ] Setting: mouse wheel = scroll or zoom
- [ ] Settings menu (wheel behaviour, shape-snap delay)
- [x] Pens, colours, language and background remembered between launches

### Stage 3 — files & library (v0.2)
- [x] Save / open a board (`.inkboard` — gzip JSON, images stored once as assets)
- [x] Board library with thumbnails: home screen ("All boards"), search, pinned boards, colour tags
- [x] Drafts live in the app's hidden library folder; explicitly saved files are tracked and
      **autosaved into the file itself**
- [x] Power-loss-safe autosave: fsync + atomic rename + `.bak`, saves within ≤5 s even while drawing,
      flush on close / sleep / shutdown; corrupt file → automatic fallback to `.bak`
- [x] Version history: snapshot every 10 min of editing (last 20), restore is undoable (Ctrl+Z)
- [x] Recently deleted (30 days, one-click restore)
- [x] Open `.inkboard` from the OS (double-click / "Open with"), single app instance
- [x] Export PNG and vector PDF (whole board or selection)
- [x] Optional backup folder (USB stick / cloud-synced folder), mirrored automatically
- [x] Migration of the 0.1 autosave into the library

### Stage 3.5 — teaching tools & updates (v0.3)
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

### Stage 4 — content
- [ ] **Hold-to-snap shapes** (like Procreate's QuickShape): draw and keep the pen down ~0.7 s
      (configurable) → the stroke becomes a clean line / circle / ellipse / rectangle / triangle / arrow.
      While still holding, the shape can be dragged to resize/rotate. The result stays a vector stroke.
      On/off in settings.
- [ ] Text, sticky notes
- [ ] Import PDF pages as backgrounds (worksheets for students)
- [ ] Templates (math grid, handwriting practice, etc.)

### Stage 5 — release
- [ ] Icon, final name
- [ ] Installers: Windows (NSIS), Linux (AppImage, .deb)
- [ ] GitHub Actions: build for every OS on each tag
- [ ] Performance: tile cache, R-tree spatial index (for very large boards)

### Later, for fun
- [ ] Online collaboration (CRDT, e.g. Yjs)

## Notes on pen input and hover

- Pointer Events give `pointerType === 'pen'`, `pressure`, tilt and pen buttons.
- While the pen hovers above the tablet without touching, `pointermove` arrives with `buttons === 0` —
  we draw the cursor with a halo. When the pen leaves the detection range, `pointerleave` hides it.
- Web APIs do **not** expose the pen's distance to the surface, only "in range / out of range". So the
  "approaching" highlight is a halo shown while the pen is within the tablet's sensing range.
- On Linux under Wayland, if pressure doesn't work, run with `--ozone-platform=x11` (`npm run dev:x11`).
