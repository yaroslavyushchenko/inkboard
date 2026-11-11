# Inkboard

A free, open-source infinite whiteboard for pen tablets — inspired by the feel of Microsoft Whiteboard.
Built for teachers who write and draw with a stylus.

- Infinite canvas: pan and zoom in any direction
- Pressure-sensitive **vector** ink — stays sharp at any zoom
- Pens, highlighter, stroke eraser (pen eraser end / barrel button supported)
- Pen hover indicator, palm rejection
- Paper backgrounds: blank, dots, grid, lines
- Images: paste, drag & drop, or insert from file
- English and Ukrainian UI

Status: early development. See [docs/PLAN.md](docs/PLAN.md) for the roadmap.

## Development

Requires Node.js (LTS or newer).

```bash
npm install
npm run dev        # start the app with hot reload
npm run dev:x11    # Linux/Wayland: use this if pen pressure doesn't work
npm run typecheck
npm run build
```

> npm 11+ may skip Electron's install script. If `npm run dev` says Electron failed to install,
> run `node node_modules/electron/install.js` once.

## Controls

| Action | Input |
|---|---|
| Draw | pen / left mouse button |
| Erase | eraser tool, pen eraser end, or pen barrel button |
| Pan | wheel / touchpad scroll, middle or right mouse drag, Space + drag, one finger |
| Zoom | Ctrl + wheel, touchpad pinch, two-finger pinch, Ctrl + / Ctrl − / Ctrl+0 |
| Tools | 1 / 2 / 3 pens, H highlighter, E eraser |
| Undo / Redo | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Insert image | Ctrl+V, drag a file in, or the toolbar button |

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
