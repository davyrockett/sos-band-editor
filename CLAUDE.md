<!-- shared-preferences:start -->
## David's preferences (shared across all of David's apps)

This section is the same in every one of David's app repos. If David states a new general preference
(not specific to this app), add it here, in this file, and commit it. David's Mac copies it to the other repos.

**Who David is.** A guitar teacher and gigging guitarist (he/him) who builds personal and teaching apps with Claude.
Comfortable with tech but not a programmer: explain in plain words, skip jargon, keep replies short and
concrete. Likes to see things working: verify before saying "done".

**How the apps are built and hosted**
- Public web apps on GitHub Pages under the **davyrockett** GitHub account (never an Artifact or a hosted
  service). Live at `https://www.davyrockett.com/<repo>/` (since 2026-10-18; old
  `davyrockett.github.io` links redirect there). The website itself is the `davyrockett.github.io` repo.
- Each app: `index.html` (+ `app.js` / `styles.css` when bigger), `sw.js` service worker for offline use
  with an update banner, `manifest.webmanifest`, `icons/` drawn by `tools/make-icons.py`, a
  `Start <App>.command` for local testing on the Mac, and a README written for David.
- **`move.js`** (since 2026-10-17): every app loads `move.js` as its first script and lists it in `sw.js`
  `ASSETS`. It carries the app's settings over when the apps move from davyrockett.github.io to
  davyrockett.com (plan: `Claude Apps/move-to-davyrockett-com.md`; master copy `Claude Apps/tools/move.js`).
  Keep it; a new app gets a copy with `data-keep` set to its own localStorage key prefix.
- **`suite.js`** (since 2026-10-18): every app also loads `<script src="suite.js" defer></script>` (in `ASSETS` too).
  It shows an "All apps" button when the app was opened from David's app suite (www.davyrockett.com/apps, one Home
  Screen icon for everything; master copy `Claude Apps/tools/suite.js`). New apps get it too. If a new app syncs,
  add it to `SYNCED` in the website's `apps/launcher.js` so the suite's one access key reaches it.
- **`share.js`** (since 2026-10-19): Settings in every app has a **Share** section (the app's link, "Copy link",
  and "Share…" where the device can). Load `<script src="share.js" defer></script>` (in `ASSETS` too) and add a
  `data-share` block using the app's own classes (see `Claude Apps/tools/share.js`). First Frets has its own
  share section with a QR code instead.
- **Every change must bump the version** (`tools/bump.sh` where it exists, otherwise `VERSION` in `sw.js`
  and the matching app version). Without it, installed copies on phones never update.
- Settings (gear icon) always has **Appearance: Light / Dark / Auto** and **Check for updates**.
  Apps open in **Light** unless changed in Settings.
- Design follows David's First Frets app: warm off-white / dark-brown palette, bright orange accent (#F57C14; dark mode #FF9433; David tried his logo orange #E27039, too red) and
  davyrockett grey secondary text (#676767; dark mode #A3A3A3),
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
- **No AI voices, ever:** no text-to-speech or synthesised singing in any app. Use written instructions on
  screen, and instrument or synth sounds for audio.
- Commit messages: a short, plain description of the change.
- When renaming or moving an app, keep the old address working with a redirect repo.

**New apps:** create the repo under davyrockett and turn on GitHub Pages; David's Mac downloads new
davyrockett repos into `~/Dropbox/Local/Claude Apps/` automatically. Give each new app its own CLAUDE.md
with this section (copy it from any other app) plus an "## This app" section.
Also add every new app to David's unlinked app list, **www.davyrockett.com/apps** (`apps/index.html` in the
website repo, `Claude Apps/website`): icon, name and one-line description, in the right group.
<!-- shared-preferences:end -->

## This app

SOS Band **Editor**: David's own app for the Sounds of Service (SOS) Band (Resounding Joy). Only David uses it
(public, but he doesn't share the link). Live: https://www.davyrockett.com/sos-band-editor/
The band gets a separate view-only app, **SOS Band** (repo davyrockett/sos-band, https://www.davyrockett.com/sos-band/),
built from this same code.

Tabs: Setlist (tap a song for its chart; "Print all charts" joins the set's PDFs into one), Stage plot
(drag people; tap one to edit them), Gear (totals from each player's gear + extras), Mixer, Band (roster, who's playing).
- **Mixer** (since 2026-10-24) is built from who's on the stage plot: every Mic and DI Box in a player's gear needs a channel
  (amps and drum kits are listed as "not through the mixer"). Default: one 10-channel mixer; option: two 8-channel mixers,
  A = instruments, its main out in stereo into B ch 7–8, B = vocals + master. Data: `show.mix` (`setup`, `ch` = channel → input,
  `off` = inputs left off, `out`); unsaved channels fill in stage order, left to right, vocals first; any change saves the whole
  layout so channels stay put. The stage plot cards show each player's channels. The old `show.mixers` list is no longer used.
  The Gear tab's PA section adds the mixers, their power cables and (two mixers) the A → B stereo cables from the setup (`mixerGear`).
Gigs ("shows" in the code/data): the picker in the header lists them, upcoming first. Band members can switch
gigs too; the band app opens on the one David marks with **★ Make the band app open on this gig** (`band.currentShow`).
At the moment: Ionis Event (Nov 4 2026), Living Your Dreams (Nov 7 2026, ★, the one being prepared) and The Midway;
the two November gigs started as copies of the Midway info (David: "same info for now").

- **One codebase, two apps.** `<html data-mode="editor">` here; the band app is the same files with
  `data-mode="band"` (no editing, no key settings). Anything marked `editor-only`
  (CSS class) or gated on `EDITOR` in app.js is hidden in the band app; `edit-only` = editing controls.
  The two apps share www.davyrockett.com storage, so localStorage keys are prefixed (`sosed.` editor, `sos.` band)
  and service-worker caches are named after the folder.
- **Publish:** `tools/bump.sh`, commit, push this repo, then `tools/publish-band-app.sh "what changed"` to copy
  the code into `../sos-band`, bump its version and push it. Confirm both live sites show the new version.
  Never edit files in the sos-band repo directly (except its README/CLAUDE.md/manifest); they get overwritten.
- **Test locally:** serve the whole `Claude Apps` folder (e.g. `python3 -m http.server 8770` there) and open
  /sos-band-editor/ (and /sos-band/ after copying). The service worker caches files: unregister it, or bump, to see changes.
- **Data:** the PUBLIC repo davyrockett/sos-band-data: `data.json` (`{app, format, items}`; each record has `type`
  member/song/show/band and `updatedAt`; deletions are `{deleted:true}`; newest edit wins; `band.currentShow` = the
  show the band app shows) and `charts/*.pdf`, served by GitHub Pages at www.davyrockett.com/sos-band-data/.
  The editor saves there with David's access key (same "Z4 Log sync" key with sos-band-data added). Without a key,
  the editor still works but changes stay on that device (red banner). The band app reads data.json straight from the GitHub API
  (no key, `cache: 'no-cache'` so unchanged answers are free), falling back to the Pages copy, which can lag minutes
  (each save triggers a Pages rebuild of the whole repo incl. charts; quick saves cancel each other). Don't edit `data.json` by hand unless David asks.
- Starting data came from `~/Dropbox/Local/Resounding Joy/SOS Band/` (Midway 2026 stage plot, gear list, mixer
  routing of May 17, and the Midway Set 2 PDF order); song list = the `SOS Chord Charts` folder.
- **Chart folder → app:** `tools/sync-charts.py` (or double-click `Sync SOS Charts.command`) adds every PDF in
  `Resounding Joy/SOS Band/SOS Chord Charts` as a song (records keep the file name in `source`) and re-uploads a chart
  when its PDF changes. Skips whole-set PDFs (names containing the word "Set"); never deletes songs. It commits
  straight to the sos-band-data clone in `../sos-band-data`. `--check` lists changes without making them.
- Setlist items: song ids, `break-…` (break; new column on wide screens) and `note-…` (custom text, kept in the show's `setNotes`). Song numbers count through breaks and notes.
- Lead singers were only filled in where obvious (Joel's originals, Cam's Funk Surprise); David fills in the rest.
- Charts open in an in-app full-screen viewer (Close / Download / Print; on phones one Save / Print button = share sheet),
  drawn by `vendor/pdf.min.js` + `pdf.worker.min.js` (pdf.js 3.11.174). Opening the PDF directly left people stuck in the
  installed app. `vendor/pdf-lib.min.js` (1.17.1) joins the set's charts for "Print all charts".
- Icons: `tools/make-icons.py` (dark = editor); `tools/make-icons.py band <folder>` (light = band app).
