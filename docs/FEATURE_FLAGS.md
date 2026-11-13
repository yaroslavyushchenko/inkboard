# Feature flags

Unfinished or experimental features can ship in a release while staying off until someone turns
them on. No rebuild is needed to switch them.

## Turning a feature on or off

- In the app: **Settings → Experimental features**. Changes apply at once and are remembered.
- By hand: edit `features.json` in the app's data folder (the Electron `userData` folder, for
  example `%APPDATA%\Inkboard` on Windows, `~/Library/Application Support/Inkboard` on macOS,
  `~/.config/Inkboard` on Linux):

  ```json
  { "darkTheme": true, "chalkboard": true }
  ```

  The file is read once when the app starts. Unknown keys and values that are not `true`/`false`
  are ignored; a missing or broken file means "all defaults".

## Current flags

| id | default | what it does |
| --- | --- | --- |
| `darkTheme` | on | Dark interface (toolbars, menus, home screen, dialogs). Adds a System / Light / Dark choice in Settings. Board content, thumbnails and exports keep their own colors. |
| `chalkboard` | off | Dark green chalkboard surface with subtle grain in Settings → Background. Dark ink is shown lighter on it (black as chalk white); the stored colors don't change. Boards using it are saved as format version 8. |

## Adding or removing a flag

1. Add an entry to `FEATURES` in `src/shared/features.ts` (id, default, description).
2. Add `feature.<id>` and `feature.<id>.hint` texts (English and Ukrainian) in `src/board/i18n.ts`.
3. Read it in the renderer with `useFeature('<id>')` (React) or `isFeatureOn('<id>')` (anywhere else).
   Keep checks out of per-frame code: read the flag where the UI is built, not inside the render loop.

When a feature becomes permanent or is dropped, delete its entry; old values in users' files are
then ignored.
