"""Brings the chord charts in Dropbox into the SOS Band apps.

Every PDF in "Resounding Joy/SOS Band/SOS Chord Charts" becomes a song in the apps' song list (with its chart);
if you replace a PDF there, the app gets the new version. Whole-set PDFs (names with the word "Set") are skipped.
Songs are never deleted from the app by this; delete them in the editor.

Run: python3 tools/sync-charts.py          (or double-click "Sync SOS Charts.command")
     python3 tools/sync-charts.py --check  (just list what would change)
"""
import json, os, re, shutil, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

# (The environment variables are only for testing.)
FOLDER = Path(os.environ.get("SOS_CHARTS_FOLDER", Path.home() / "Dropbox/Local/Resounding Joy/SOS Band/SOS Chord Charts"))
DATA = Path(os.environ.get("SOS_DATA_REPO", Path(__file__).resolve().parent.parent.parent / "sos-band-data"))
SMALL = {"a", "an", "and", "the", "of", "to", "in", "on", "for", "at", "by", "with", "from", "or"}


def git(*args):
    return subprocess.run(["git", "-C", str(DATA), *args], capture_output=True, text=True)


def title_from(stem):
    t = re.sub(r"(?i)[ _-]*(chords|official|tab|lyrics)?(-\d+)?$", "", stem).strip() or stem
    t = re.sub(r"(?i)\s+(chords|official)$", "", t).strip()
    if t == t.lower():  # "my girl" -> "My Girl"
        words = t.split()
        t = " ".join(w if (i and w in SMALL) else w[:1].upper() + w[1:] for i, w in enumerate(words))
    return t


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-") or "chart"


def plan(items):
    songs = {k: v for k, v in items.items() if v.get("type") == "song" and not v.get("deleted")}
    by_source = {v.get("source"): k for k, v in songs.items() if v.get("source")}
    adds, updates = [], []
    for pdf in sorted(FOLDER.glob("*.pdf"), key=lambda p: p.name.lower()):
        if re.search(r"(?i)\bset\b", pdf.stem):
            continue
        sid = by_source.get(pdf.name)
        if sid:
            have = DATA / songs[sid]["chart"] if songs[sid].get("chart") else None
            if not have or not have.exists() or have.read_bytes() != pdf.read_bytes():
                updates.append((sid, pdf))
        else:
            adds.append(pdf)
    return adds, updates


def apply(items, adds, updates):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for sid, pdf in updates:
        r = items[sid]
        r.setdefault("chart", f"charts/{sid[2:]}.pdf")
        shutil.copyfile(pdf, DATA / r["chart"])
        r["chartVersion"] = int(time.time() * 1000)
        r["updatedAt"] = now
    for pdf in adds:
        title = title_from(pdf.stem)
        base = slug(title)
        name, n = base, 2
        while f"s-{name}" in items or (DATA / "charts" / f"{name}.pdf").exists():
            name, n = f"{base}-{n}", n + 1
        shutil.copyfile(pdf, DATA / "charts" / f"{name}.pdf")
        items[f"s-{name}"] = {"type": "song", "title": title, "artist": "", "lead": "", "key": "", "notes": "",
                              "chart": f"charts/{name}.pdf", "source": pdf.name, "updatedAt": now}


def main():
    check = "--check" in sys.argv
    if not FOLDER.exists():
        sys.exit(f"Can't find the charts folder: {FOLDER}")
    if git("status", "--porcelain").stdout.strip():
        sys.exit(f"{DATA} has unsaved changes; sort those out first.")
    for attempt in range(3):
        pull = git("pull", "-q", "--ff-only")
        if pull.returncode:
            sys.exit("Couldn't get the latest from GitHub:\n" + pull.stderr)
        data = json.loads((DATA / "data.json").read_text())
        adds, updates = plan(data["items"])
        if not adds and not updates:
            print("Charts are up to date. Nothing to add.")
            return
        for pdf in adds:
            print(f"  + new song: {title_from(pdf.stem)}   ({pdf.name})")
        for sid, pdf in updates:
            print(f"  ↻ new chart: {data['items'][sid]['title']}   ({pdf.name})")
        if check:
            return
        apply(data["items"], adds, updates)
        (DATA / "data.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        git("add", "-A")
        msg = f"Charts from Dropbox: {len(adds)} new, {len(updates)} updated"
        git("commit", "-q", "-m", msg)
        if git("push", "-q").returncode == 0:
            print(f"Done: {msg.split(': ')[1]}. The apps will show it in a minute or two.")
            return
        # Someone saved from the app at the same moment: undo our commit, get theirs, try again.
        git("reset", "-q", "--hard", "HEAD~1")
    sys.exit("Couldn't send the charts to GitHub after 3 tries. Try again in a minute.")


if __name__ == "__main__":
    main()
