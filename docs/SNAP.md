# Snap Store and Ubuntu App Center

Ubuntu App Center only shows screenshots, the license, the full description and the update date
for apps that come from the Snap Store. A downloaded `.deb` always gets a bare card, so Inkboard is
also published as a snap.

## What is automated

- `npm run dist:linux` builds `dist/Inkboard-<version>-linux-amd64.snap` next to the AppImage and
  the `.deb` (config: `snapcraft` in `electron-builder.yml`, base `core24`, strict confinement).
- On a `vX.Y.Z` tag, the `snap` job in `.github/workflows/release.yml` uploads the snap to the
  `stable` channel. Until the `SNAPCRAFT_STORE_CREDENTIALS` secret exists the job prints a notice
  and does nothing, so releases keep working.
- Inside the snap the app does not check GitHub for updates: snapd updates it, and Settings says so.

## One-time steps (only you can do these)

1. **Create an Ubuntu One account** at <https://login.ubuntu.com> (or sign in), then open
   <https://snapcraft.io/account> once and accept the developer agreement.

2. **Install snapcraft and reserve the name** on your computer:

   ```bash
   sudo snap install snapcraft --classic --channel=8.x/stable
   snapcraft login
   snapcraft register inkboard
   ```

   The snap name comes from the executable name (`inkboard`). If the store says the name is taken,
   stop here: the snap name has to be changed in `electron-builder.yml` and in this file first.

3. **Export credentials for CI** (valid for one year; repeat this step when they expire):

   ```bash
   snapcraft export-login --snaps=inkboard --acls package_access,package_push,package_update,package_release --expires 2027-11-01 snapcraft-credentials.txt
   ```

4. **Add the GitHub secret**: in the repository go to *Settings → Secrets and variables → Actions →
   New repository secret*, name it `SNAPCRAFT_STORE_CREDENTIALS` and paste the whole content of
   `snapcraft-credentials.txt`. Or from the repository folder:

   ```bash
   gh secret set SNAPCRAFT_STORE_CREDENTIALS < snapcraft-credentials.txt
   ```

   Then delete the file: `rm snapcraft-credentials.txt`.

5. **First upload**: either push the next release tag (the workflow uploads it), or upload a local
   build right away:

   ```bash
   snapcraft upload --release=stable dist/Inkboard-*-linux-amd64.snap
   ```

   The first upload of a strictly confined snap is usually published within minutes. If the store
   holds it for manual review, answer on <https://forum.snapcraft.io> in the thread it links to.

6. **Fill in the store listing** at <https://snapcraft.io/inkboard/listing>. The page exists only
   after the first upload; until then the name only shows under *Registered snap names*.
   electron-builder can not put these fields into the snap, so they live only on the store page:
   - **Screenshots**: upload `docs/images/hero.png`, `docs/images/home.png` and
     `docs/images/text-format.png` (up to 5 images).
   - **License**: `GPL-3.0-or-later`.
   - **Website**: `https://github.com/yaroslavyushchenko/inkboard`
   - **Source code**: `https://github.com/yaroslavyushchenko/inkboard`
   - **Contact / issues**: `https://github.com/yaroslavyushchenko/inkboard/issues`
   - **Category**: Education.
   - Summary, title, description and the icon come from the snap itself on every upload.

   Click *Save*.

After that every `vX.Y.Z` tag publishes to the store, and App Center shows the update date of the
latest stable upload.

## Building the snap locally

electron-builder runs snapcraft, which builds inside an LXD container. Use snapcraft 8.x:
snapcraft 9 looks for the desktop file before it copies `snap/gui` into the snap, so the build
fails with "Failed to generate desktop file ... meta/gui/inkboard.desktop".

```bash
sudo snap install snapcraft --classic --channel=8.x/stable
sudo snap install lxd
sudo lxd init --auto
sudo usermod -aG lxd "$USER"   # then log out and back in
npm run dist:linux
sudo snap install --dangerous dist/Inkboard-*-linux-amd64.snap
```

A snap installed with `--dangerous` does not get store updates. Remove it with
`sudo snap remove inkboard` before installing the store version.

## Notes on confinement

Tested with a local `--dangerous` install on Ubuntu 26.04 (GNOME, Wayland):

- **Strict** confinement works. Pen events reach the board with pressure and tilt, boards autosave
  into the library, and *Save as file* / *Open* show the GNOME file dialog through the XDG desktop
  portal and return the real path of the chosen file (for example `~/Documents/Board.inkboard`).
  A board file passed on the command line opens in the running window.
- Not tested: a real pen tablet through the snap. Pen input uses the same Wayland/X11 plugs as the
  mouse, so it should behave like the `.deb`; draw a few strokes after the first store install.
- Boards and the library live in `~/snap/inkboard/current/.config/Inkboard`, not in
  `~/.config/Inkboard`. Someone moving from the `.deb` or AppImage starts with an empty library;
  they can copy the old `Library` folder over while the snap is closed.
- The `removable-media` plug (USB sticks under `/media`) is not connected automatically. Files on a
  stick still open and save through the file dialog. To give the app direct access run
  `sudo snap connect inkboard:removable-media`, or ask for auto-connection on
  <https://forum.snapcraft.io> (category *store-requests*) after the first upload.
- Electron can not ask logind for a sleep or shutdown notice inside a strict snap (AppArmor denies
  `org.freedesktop.login1.Manager.Inhibit`), so the extra save right before suspend does not run.
  The normal autosave every few seconds still does, and every write stays power-cut safe.
- Ubuntu sees `.inkboard` files as gzip archives (no MIME type for them is registered on the
  system), so the file manager does not offer Inkboard on double-click. Use the app's Open button.
