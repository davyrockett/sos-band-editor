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

SOS Band: for the Sounds of Service (SOS) Band (Resounding Joy). Live: https://davyrockett.github.io/sos-band/
Tabs: Setlist (tap a song for its chart; "Print all charts" joins the set's PDFs into one), Stage plot,
Gear (totals worked out from each player's gear + extras), Mixer (channels per mixer), Band (roster, who's playing).
A show picker in the header holds several shows; "New show (copy of this)" starts the next gig.

- **Publish:** run `tools/bump.sh` (bumps `sw.js` and index.html together), commit, push, confirm live.
- **Test locally:** `Start SOS Band.command` (port 8770). The service worker caches files, so after editing
  unregister it (or bump) before checking changes in the browser.
- **Data:** everything is in the PUBLIC repo davyrockett/sos-band-data: `data.json` (`{app, format, items}`;
  each record has `type` member/song/show/band and `updatedAt`; deletions are `{deleted:true}`; newest edit wins)
  and `charts/*.pdf`, served by GitHub Pages at davyrockett.github.io/sos-band-data/. Anyone can view; editing
  needs an access key pasted once per device (same "Z4 Log sync" key with sos-band-data added). Not connected = view only.
  New charts uploaded in the app go to `charts/` in that repo. Don't edit `data.json` by hand unless David asks.
- Starting data came from `~/Dropbox/Local/Resounding Joy/SOS Band/` (Midway 2026 stage plot, gear list, mixer
  routing of May 17, and the Midway Set 2 PDF order); song list = the `SOS Chord Charts` folder.
- Lead singers were only filled in where obvious (Joel's originals, Cam's Funk Surprise); David fills in the rest.
- `vendor/pdf-lib.min.js` (1.17.1) joins chart PDFs for printing.
