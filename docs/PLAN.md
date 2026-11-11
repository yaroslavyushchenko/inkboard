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
- [ ] Lasso selection: move, scale, delete, copy (ink and images)
- [ ] Point eraser (splits strokes), eraser size
- [ ] Ruler (draw straight lines along it)
- [ ] Laser pointer (fading trail — handy for showing things to students)
- [ ] Dark board theme (classic green/black chalkboard)
- [ ] Setting: mouse wheel = scroll or zoom
- [ ] Settings menu (wheel behaviour, shape-snap delay)

### Stage 3 — files
- [ ] Save / open a board (`.inkboard` — compressed JSON, images stored as assets)
- [ ] Autosave, crash recovery
- [ ] Recent boards on a start screen
- [ ] Export to PNG / SVG / PDF (selection or whole board)

### Stage 4 — content
- [ ] **Hold-to-snap shapes** (like Procreate's QuickShape): draw and keep the pen down ~0.7 s
      (configurable) → the stroke becomes a clean line / circle / ellipse / rectangle / triangle / arrow.
      While still holding, the shape can be dragged to resize/rotate. The result stays a vector stroke.
      On/off in settings.
- [ ] Shapes from a menu (rectangle, ellipse, arrow, line)
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
