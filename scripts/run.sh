#!/usr/bin/env bash
# Video/audio -> two-hand sheet. Usage: scripts/run.sh input/song.mp4 [extra to_sheet.py options]
set -euo pipefail
cd "$(dirname "$0")/.."
src="$1"; shift
name="$(basename "${src%.*}")"
ffmpeg -v error -y -i "$src" -vn -ac 1 -ar 16000 "output/$name.wav"
uv run python scripts/transcribe.py "output/$name.wav" "output/$name.raw.mid"
uv run python scripts/to_sheet.py "output/$name.wav" "output/$name.raw.mid" "output/$name" "$@"
echo "Add \"$name\" to SONGS in player.js, then open http://localhost:8000/?song=$name"
