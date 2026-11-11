Test build of **Inkboard** — a free infinite whiteboard for pen tablets.

## What's new in 0.2

- **Your work is always saved.** Every board autosaves within a few seconds — also safe if the power goes out.
- **All boards** screen (Ctrl+H) with previews, search, pinned boards and colour **tags** (e.g. "5A", "Math").
- **Version history** — go back to how the board looked earlier (snapshot every 10 minutes of work).
- **Recently deleted** — deleted boards can be restored for 30 days.
- **Save as file…** puts a board in any folder; it keeps saving itself there automatically.
- **Export** to PNG or PDF (the whole board or just the selection) — e.g. to send to students.
- **Backup folder** (Settings ⚙): every board is also copied to a USB stick or Google Drive / OneDrive folder.
- Double-clicking an `.inkboard` file opens it in Inkboard.

## Download

| System | File |
|---|---|
| Windows | `Inkboard-Setup-…-x64.exe` |
| macOS (Intel and Apple Silicon) | `Inkboard-…-mac-universal.dmg` |
| Linux | `.AppImage` (any distro) or `.deb` (Ubuntu / Debian) |

## First launch

The builds are not code-signed yet, so the system will warn you once:

- **Windows:** "Windows protected your PC" → click **More info** → **Run anyway**.
- **macOS:** open the `.dmg`, drag Inkboard to Applications, then **right-click the app → Open → Open**.
  If macOS says the app is damaged, run `xattr -cr /Applications/Inkboard.app` in Terminal.
- **Linux AppImage:** `chmod +x Inkboard-*.AppImage` and run it.

Boards from 0.1 are moved into the new board list automatically.

Feedback and bug reports: open an issue in this repository.
