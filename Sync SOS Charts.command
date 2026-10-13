#!/bin/bash
# Double-click to add new chord charts from Dropbox (SOS Band/SOS Chord Charts) to the SOS Band apps.
cd "$(dirname "$0")"
python3 tools/sync-charts.py
echo
read -n 1 -s -r -p "Press any key to close."
