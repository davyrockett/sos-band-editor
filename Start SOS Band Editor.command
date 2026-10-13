#!/bin/bash
# Double-click this file to run a local test copy of the app on this Mac.
# Keep this window open while you use it; close it to stop.
cd "$(dirname "$0")"
PORT=8770
if ! lsof -i :$PORT >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 1
fi
open -a Safari "http://localhost:$PORT/"
echo "SOS Band Editor is running at http://localhost:$PORT"
echo "Close this window when you're done."
wait
