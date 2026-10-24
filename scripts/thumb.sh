#!/usr/bin/env bash
# Preview picture for a song's link (Discord, Messenger, Zalo, X): the video's frame at the
# start of the sheet, 1200x630, the frame centred on a blurred copy of itself.
# Usage: scripts/thumb.sh <name>   -> output/<audio without extension>.jpg
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:?usage: scripts/thumb.sh <name>}"
read -r video audio < <(python3 -c '
import json, sys
s = next((s for s in json.load(open("songs.json")) if s["name"] == sys.argv[1]), None)
if not s: sys.exit(f"{sys.argv[1]} is not in songs.json")
print(s.get("video") or "-", s["audio"])' "$name")
if [ "$video" = "-" ]; then echo "$name has no video, the site-wide public/og.png is used"; exit 0; fi
at=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["sixteenths"][0])' "output/$name.timing.json" 2>/dev/null || echo 0)
out="output/${audio%.*}.jpg"
ffmpeg -v error -y -ss "$at" -i "input/$video" -frames:v 1 -filter_complex \
  "[0:v]split[a][b];[a]scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630,boxblur=30,eq=brightness=-0.25[bg];[b]scale=-2:630[fg];[bg][fg]overlay=(W-w)/2:0" \
  -q:v 3 "$out"
echo "$out"
