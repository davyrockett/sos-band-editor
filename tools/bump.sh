#!/bin/bash
# Bumps the app version in sw.js and index.html together (v3 -> v4).
# Run before committing any change: tools/bump.sh
cd "$(dirname "$0")/.."
cur=$(grep -o "VERSION = 'v[0-9]*'" sw.js | grep -o "[0-9]*")
next=$((cur + 1))
sed -i '' "s/const VERSION = 'v$cur';/const VERSION = 'v$next';/" sw.js
sed -i '' "s/window.APP_VERSION = 'v[0-9]*';/window.APP_VERSION = 'v$next';/" index.html
echo "v$cur -> v$next"
