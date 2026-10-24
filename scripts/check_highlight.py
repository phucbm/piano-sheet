"""Check that the player in index.html highlights every note of a sheet.

Plays the sheet like the browser does (Verovio MIDI, one lookup per note onset,
10 ms past the onset) at every speed and lists notes that never turn red.
Tied notes are held, not struck again, so they never light up: reported, not failed.

Usage:
  uv run python scripts/check_highlight.py output/song.musicxml [more.musicxml ...]
Exits 1 if any struck note is missed.
"""
import base64
import io
import sys
import warnings

import pretty_midi
import verovio

warnings.filterwarnings("ignore")  # pretty_midi complains about Verovio's tempo track

SPEEDS = [0.5, 0.75, 1.0]  # options of the Speed select in index.html
MARGIN_MS = 10  # same as the "note" handler in index.html


def check(xml, speed):
    tk = verovio.toolkit()
    tk.setOptions({"midiTempoAdjustment": speed})
    tk.loadData(xml)
    midi = pretty_midi.PrettyMIDI(io.BytesIO(base64.b64decode(tk.renderToMIDI())))
    onsets = {round(n.start * 1000) for i in midi.instruments for n in i.notes}
    lit = set()
    for t in onsets:
        lit.update(tk.getElementsAtTime(t + MARGIN_MS).get("notes", []))
    missed, tied = [], []
    for e in tk.renderToTimemap():
        for nid in e.get("on", []):
            if nid in lit:
                continue
            struck = any(abs(e["tstamp"] - t) <= 1 for t in onsets)
            (missed if struck else tied).append(e["tstamp"])
    return missed, tied


failed = False
for path in sys.argv[1:]:
    xml = open(path).read()
    for speed in SPEEDS:
        missed, tied = check(xml, speed)
        print(f"{path} {speed:.0%}: {len(missed)} missed, {len(tied)} tied (ok)")
        for ms in missed:
            print(f"  missed note at {ms / 1000:.2f}s")
        failed |= bool(missed)
sys.exit(1 if failed else 0)
