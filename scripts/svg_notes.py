"""List the notes of a Sibelius SVG sheet (piano, two staves), bar by bar, with exact pitches.

Reads the notehead glyphs (Opus fonts) and the staff lines, so pitches come from the
drawing, not from eyeballing. Durations, ties and tuplets still have to be read off the
picture: this prints each notehead's kind (q = filled, h = half/hollow) to help.

Usage:
  python3 scripts/svg_notes.py sheet.svg
Prints, per system and bar: `RH bar N: x:pitch ...` and `LH bar N: ...`, plus accidentals
and rests found in that bar. Bar numbers count the first bar of the page as 1 (a pickup,
if there is one, shows as bar 1 too: check the picture).
"""
import re
import sys

# Opus (Sibelius) glyphs.
HEADS = {"": "q", "": "h", "": "w"}
ACCS = {"": "flat", "": "sharp", "": "natural"}
RESTS = {"": "8th rest", "": "quarter rest", "": "16th rest", "": "half/whole rest"}
STEPS = "CDEFGAB"

svg = re.sub(r"<style>.*?</style>", "", open(sys.argv[1], encoding="utf-8").read(), flags=re.S)

glyphs = []  # (x, y, char)
for m in re.finditer(r'<g [^>]*?transform="matrix\(([^)]*)\)"[^>]*>\s*<text[^>]*?x="([-\d.]+)"[^>]*?y="([-\d.]+)"[^>]*>(.*?)</text>', svg, re.S):
    a, b, c, d, e, f = map(float, m.group(1).split(","))
    glyphs.append((e + float(m.group(2)) * a, f + float(m.group(3)) * d, m.group(4)))

horiz, vert = [], []
for m in re.finditer(r'<polyline points="([\d.]+),([\d.]+) ([\d.]+),([\d.]+) "', svg):
    x1, y1, x2, y2 = map(float, m.groups())
    if y1 == y2 and x2 - x1 > 500:
        horiz.append(y1)
    elif x1 == x2:
        vert.append((x1, y1, y2))
lines = sorted(set(horiz))
staves = [lines[i:i + 5] for i in range(0, len(lines), 5)]
systems = [(staves[i], staves[i + 1]) for i in range(0, len(staves) - 1, 2)]


def pitch(staff, y, treble):
    gap = (staff[-1] - staff[0]) / 4
    i = STEPS.index("E" if treble else "G") + round((staff[-1] - y) / (gap / 2))
    return STEPS[i % 7] + str((4 if treble else 2) + i // 7)


bar_no = 1
for si, (top, bottom) in enumerate(systems):
    # Bar lines span the whole system; double bars and repeats are a few lines close together.
    xs = sorted({x for x, y1, y2 in vert if abs(y1 - top[0]) < 2 and abs(y2 - bottom[-1]) < 2})
    bars = [x for i, x in enumerate(xs) if i == 0 or x - xs[i - 1] > 40]
    mid = (top[-1] + bottom[0]) / 2
    lo, hi = top[0] - 8 * (top[1] - top[0]), bottom[-1] + 8 * (top[1] - top[0])
    print(f"=== system {si + 1}")
    for b0, b1 in zip(bars, bars[1:]):
        inside = sorted(g for g in glyphs if b0 < g[0] < b1 and lo < g[1] < hi)
        for name, staff, treble, sel in (("RH", top, True, lambda y: y < mid), ("LH", bottom, False, lambda y: y >= mid)):
            here = [g for g in inside if sel(g[1])]
            notes = [f"{int(x)}:{pitch(staff, y, treble)}{'' if HEADS[t] == 'q' else '(' + HEADS[t] + ')'}" for x, y, t in here if t in HEADS]
            extra = [f"{int(x)}:{ACCS.get(t) or RESTS[t]}" + (f"@{pitch(staff, y, treble)}" if t in ACCS else "") for x, y, t in here if t in ACCS or t in RESTS]
            print(f"{name} bar {bar_no}: {' '.join(notes)}" + (f"   [{', '.join(extra)}]" if extra else ""))
        bar_no += 1
