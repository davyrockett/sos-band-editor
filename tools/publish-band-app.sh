#!/bin/bash
# Copies this editor's code into the band's view-only app (../sos-band), bumps its version,
# then commits and pushes it. Run after publishing a change to the editor:
#   tools/publish-band-app.sh "Short description of the change"
set -e
cd "$(dirname "$0")/.."
BAND=../sos-band
[ -d "$BAND/.git" ] || { echo "Can't find the band app at $BAND"; exit 1; }
git -C "$BAND" pull -q --ff-only || true
cur=$(grep -o "VERSION = 'v[0-9]*'" "$BAND/sw.js" 2>/dev/null | grep -o "[0-9]*" || echo 0)
next=$((cur + 1))
cp app.js styles.css sw.js move.js "$BAND/"
mkdir -p "$BAND/vendor" && cp vendor/*.js "$BAND/vendor/"
sed -e 's/data-mode="editor"/data-mode="band"/' \
    -e 's#<title>SOS Band Editor</title>#<title>SOS Band</title>#' \
    -e 's/content="SOS Editor"/content="SOS Band"/' \
    -e "s/window.APP_VERSION = 'v[0-9]*';/window.APP_VERSION = 'v$next';/" index.html > "$BAND/index.html"
sed -i '' "s/const VERSION = 'v[0-9]*';/const VERSION = 'v$next';/" "$BAND/sw.js"
python3 tools/make-icons.py band "$BAND/icons" >/dev/null
cd "$BAND"
git add -A
git commit -qm "${1:-Update from the editor}"
git push -q
echo "Band app is now v$next"
