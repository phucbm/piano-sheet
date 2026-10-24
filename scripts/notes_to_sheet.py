"""A two-hand sheet typed in by hand (from a picture, a PDF or an SVG) -> MusicXML.

Usage:
  uv run python scripts/notes_to_sheet.py input/<name>.notes   -> output/<name>.musicxml

The .notes file: `key: value` lines on top, then one `rh:` and one `lh:` line per bar, in order.

  name: DoiBo-QuiSaura      # the file slug; also the sheet's title
  key: C                    # music21 key: C, G, F, a, e, B-, ...
  time: 4/4
  tempo: 65                 # quarter = 65
  pickup: 1/16              # length of the first bar when it's a pickup (leave out if none)
  repeat: 9                 # bars that open a repeat ‖:, comma separated (bar 0 = pickup)
  end-repeat: 16            # bars that close one :‖
  lh-beams: 2/4 2/4         # how the left hand groups eighths (leave out for music21's default)
  rh: E5/8 E5/16 E5/16~ E5/8. r/16 B-4/8t A4/8t G4/8t
  lh: D3+F3+A3+D4/2a C3/2

A note is pitch/length: 1 2 4 8 16 32, `.` dotted, `t` a triplet note, `~` tied to the next
note, `a` arpeggiated. `r` is a rest, `A+C+E` a chord, flats are `-` (B-3), sharps `#`.
Every bar is checked to add up to the time signature (the pickup to its own length).
"""
import sys
from fractions import Fraction

from music21 import bar, chord, clef, duration, expressions, key, layout, meter, metadata, note, stream, tempo, tie

LENGTHS = {"1": 4, "2": 2, "4": 1, "8": .5, "16": .25, "32": .125}

path = sys.argv[1]
head, rows = {}, {"rh": [], "lh": []}
for line in open(path, encoding="utf-8"):
    line = line.split(" #")[0].strip()  # a comment starts with "#" after a space; C#4 is a sharp
    if not line or line.startswith("#"):
        continue
    k, v = (s.strip() for s in line.split(":", 1))
    (rows[k].append(v) if k in rows else head.__setitem__(k, v))
if len(rows["rh"]) != len(rows["lh"]):
    sys.exit(f"{len(rows['rh'])} rh bars but {len(rows['lh'])} lh bars")

name = head["name"]
beats = Fraction(head.get("time", "4/4")) * 4
pickup = float(Fraction(head["pickup"]) * 4) if "pickup" in head else 0
first = 0 if pickup else 1
opens = {int(b) for b in head.get("repeat", "").split(",") if b.strip()}
closes = {int(b) for b in head.get("end-repeat", "").split(",") if b.strip()}


def parse(tok):
    p, d = tok.rsplit("/", 1)
    flags = set(c for c in d if c in "~at")
    d = d.strip("~at")
    ql = LENGTHS[d.rstrip(".")] * (1.5 if d.endswith(".") else 1)
    n = note.Rest(quarterLength=ql) if p == "r" else chord.Chord(p.split("+"), quarterLength=ql) if "+" in p else note.Note(p, quarterLength=ql)
    if "t" in flags:
        n.duration.appendTuplet(duration.Tuplet(3, 2))
    if "a" in flags:
        n.expressions.append(expressions.ArpeggioMark())
    return n, "~" in flags


def staff(bars, which, beams):
    part, tied = stream.PartStaff(), False
    for i, row in enumerate(bars):
        m = stream.Measure(number=i + first)
        if i == 0:
            ts = meter.TimeSignature(head.get("time", "4/4"))
            if beams:
                ts.beamSequence.partition(beams.split())
            m.append([clef.TrebleClef() if which == "rh" else clef.BassClef(), key.Key(head.get("key", "C")), ts])
        if m.number in opens:
            m.leftBarline = bar.Repeat(direction="start")
        if m.number in closes:
            m.rightBarline = bar.Repeat(direction="end")
        for tok in row.split():
            n, ties = parse(tok)
            if not isinstance(n, note.Rest) and (ties or tied):
                n.tie = tie.Tie("continue" if ties and tied else "start" if ties else "stop")
            tied = ties
            m.append(n)
        want = pickup if m.number == 0 else float(beats)
        if abs(m.duration.quarterLength - want) > 1e-6:
            sys.exit(f"{which} bar {m.number}: {m.duration.quarterLength} quarters, want {want}")
        if m.number == 0:
            m.paddingLeft = float(beats) - pickup
        part.append(m)
    return part


score = stream.Score()
score.metadata = metadata.Metadata(title=name)
score.metadata.movementName = name
rh, lh = staff(rows["rh"], "rh", None), staff(rows["lh"], "lh", head.get("lh-beams"))
if "tempo" in head:
    rh.getElementsByClass(stream.Measure).first().insert(0, tempo.MetronomeMark(number=float(head["tempo"]), referent=note.Note(type="quarter")))
# A pickup bar with only a rest in one hand: hide the rest, like the printed sheet.
if pickup:
    for part in (rh, lh):
        m = part.getElementsByClass(stream.Measure).first()
        if len(m.notesAndRests) == 1 and m.notesAndRests[0].isRest:
            m.notesAndRests[0].style.hideObjectOnPrint = True
score.insert(0, rh)
score.insert(0, lh)
score.insert(0, layout.StaffGroup([rh, lh], symbol="brace"))
out = f"output/{name}.musicxml"
score.write("musicxml", fp=out)
print(out)
