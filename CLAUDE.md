<!-- shared-preferences:start -->
## David's preferences (shared across all of David's apps)

This section is the same in every one of David's app repos. If David states a new general preference
(not specific to this app), add it here, in this file, and commit it. David's Mac copies it to the other repos.

**Who David is.** A guitar teacher and gigging guitarist (he/him) who builds personal and teaching apps with Claude.
Comfortable with tech but not a programmer: explain in plain words, skip jargon, keep replies short and
concrete. Likes to see things working: verify before saying "done".

**How the apps are built and hosted**
- Public web apps on GitHub Pages under the **davyrockett** GitHub account (never an Artifact or a hosted
  service). Live at `https://davyrockett.github.io/<repo>/`.
- Each app: `index.html` (+ `app.js` / `styles.css` when bigger), `sw.js` service worker for offline use
  with an update banner, `manifest.webmanifest`, `icons/` drawn by `tools/make-icons.py`, a
  `Start <App>.command` for local testing on the Mac, and a README written for David.
- **Every change must bump the version** (`tools/bump.sh` where it exists, otherwise `VERSION` in `sw.js`
  and the matching app version). Without it, installed copies on phones never update.
- Settings (gear icon) always has **Appearance: Light / Dark / Auto** and **Check for updates**.
  Apps open in **Light** unless changed in Settings.
- Design follows David's First Frets app: warm off-white / dark-brown palette, orange accent,
  Big Shoulders Display headings, Atkinson Hyperlegible body text, works well on a phone.
- Data lives on the device (localStorage / IndexedDB). Apps whose data must sync between phone and Mac
  use a separate `davyrockett/<app>-data` repo (`data.json`) and an access key pasted into Settings.
  Never commit keys, tokens or anything in `private/`.
- **Publish when done:** commit, push to `main`, and confirm the live site shows the new version.
  End with a brief summary of what changed. David's Mac pulls GitHub changes into its Dropbox copy
  automatically, so pushing is all that's needed.

**Taste**
- Labels and descriptions plain and descriptive. Jokes belong in names (e.g. "Page Fright"), not taglines.
- Keep screens uncluttered: show extra controls only when they're relevant.
- Nothing should jump around: when a control doesn't apply, grey it out in place rather than hiding it, and
  reserve space for things that appear, so other controls never shift.
- Commit messages: a short, plain description of the change.
- When renaming or moving an app, keep the old address working with a redirect repo.

**New apps:** create the repo under davyrockett and turn on GitHub Pages; David's Mac downloads new
davyrockett repos into `~/Dropbox/Local/Claude Apps/` automatically. Give each new app its own CLAUDE.md
with this section (copy it from any other app) plus an "## This app" section.
<!-- shared-preferences:end -->

## This app

SOS Band **Editor**: David's own app for the Sounds of Service (SOS) Band (Resounding Joy). Only David uses it
(public, but he doesn't share the link). Live: https://davyrockett.github.io/sos-band-editor/
The band gets a separate view-only app, **SOS Band** (repo davyrockett/sos-band, https://davyrockett.github.io/sos-band/),
built from this same code.

Tabs: Setlist (tap a song for its chart; "Print all charts" joins the set's PDFs into one), Stage plot
(drag people; tap one to edit them), Gear (totals from each player's gear + extras), Mixer, Band (roster, who's playing).
Gigs ("shows" in the code/data): the picker in the header lists them, upcoming first. Band members can switch
gigs too; the band app opens on the one David marks with **★ Make the band app open on this gig** (`band.currentShow`).
At the moment: Ionis Event (Nov 4 2026), Living Your Dreams (Nov 7 2026, ★, the one being prepared) and The Midway;
the two November gigs started as copies of the Midway info (David: "same info for now").

- **One codebase, two apps.** `<html data-mode="editor">` here; the band app is the same files with
  `data-mode="band"` (no editing, no key settings). Anything marked `editor-only`
  (CSS class) or gated on `EDITOR` in app.js is hidden in the band app; `edit-only` = editing controls.
  The two apps share davyrockett.github.io storage, so localStorage keys are prefixed (`sosed.` editor, `sos.` band)
  and service-worker caches are named after the folder.
- **Publish:** `tools/bump.sh`, commit, push this repo, then `tools/publish-band-app.sh "what changed"` to copy
  the code into `../sos-band`, bump its version and push it. Confirm both live sites show the new version.
  Never edit files in the sos-band repo directly (except its README/CLAUDE.md/manifest); they get overwritten.
- **Test locally:** serve the whole `Claude Apps` folder (e.g. `python3 -m http.server 8770` there) and open
  /sos-band-editor/ (and /sos-band/ after copying). The service worker caches files: unregister it, or bump, to see changes.
- **Data:** the PUBLIC repo davyrockett/sos-band-data: `data.json` (`{app, format, items}`; each record has `type`
  member/song/show/band and `updatedAt`; deletions are `{deleted:true}`; newest edit wins; `band.currentShow` = the
  show the band app shows) and `charts/*.pdf`, served by GitHub Pages at davyrockett.github.io/sos-band-data/.
  The editor saves there with David's access key (same "Z4 Log sync" key with sos-band-data added). Without a key,
  the editor still works but changes stay on that device (red banner). The band app reads the Pages copy, so changes
  reach the band within a minute or two. Don't edit `data.json` by hand unless David asks.
- Starting data came from `~/Dropbox/Local/Resounding Joy/SOS Band/` (Midway 2026 stage plot, gear list, mixer
  routing of May 17, and the Midway Set 2 PDF order); song list = the `SOS Chord Charts` folder.
- **Chart folder → app:** `tools/sync-charts.py` (or double-click `Sync SOS Charts.command`) adds every PDF in
  `Resounding Joy/SOS Band/SOS Chord Charts` as a song (records keep the file name in `source`) and re-uploads a chart
  when its PDF changes. Skips whole-set PDFs (names containing the word "Set"); never deletes songs. It commits
  straight to the sos-band-data clone in `../sos-band-data`. `--check` lists changes without making them.
- Setlist items: song ids, `break-…` (break; new column on wide screens) and `note-…` (custom text, kept in the show's `setNotes`). Song numbers count through breaks and notes.
- Lead singers were only filled in where obvious (Joel's originals, Cam's Funk Surprise); David fills in the rest.
- `vendor/pdf-lib.min.js` (1.17.1) joins chart PDFs for printing.
- Icons: `tools/make-icons.py` (dark = editor); `tools/make-icons.py band <folder>` (light = band app).
