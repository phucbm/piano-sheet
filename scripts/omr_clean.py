"""Clean up Audiveris' MusicXML of a printed piano sheet so the player can use it.

Usage:
  uv run python scripts/omr_clean.py <audiveris>.mxl output/<name>.musicxml --name <name> [options]
  uv run python scripts/omr_clean.py output/<name>.musicxml --dump     # every bar as text, to check

Always done:
  - beams repeated on a chord's other notes are dropped (Verovio crashes on them);
  - pedal marks go (the player works out its own pedal), and so does the "Piano" part name;
  - a hand's first beat put in its own voice (<backup> then <forward> of about the same length)
    is merged back into the hand's voice;
  - a stray rest next to a whole-bar rest is dropped;
  - a note read one length too short (the bar is short by exactly that, and the notes either side
    are the length it should be: an eighth among eighths read as a sixteenth) is lengthened.

Options, decided by looking at the PDF:
  --name N             title (the file slug, as for every song)
  --tempo 70           quarter = 70 (Audiveris doesn't read the tempo mark)
  --composer, --arranger
  --dyn 1:p,5:mp       keep only these dynamics (bar:mark); without it every dynamic stays
  --drop slur,staccato,accent,fermata,breath-mark,tenuto   remove these everywhere (Audiveris
                       makes slurs, dots and fermatas out of pedal marks)
  --tie 25             tie bar 25's last right-hand chord to the same notes at the start of 26
                       (25:2 for the left hand)
  --fermata 52         a fermata over bar 52's last right-hand chord (52:2 for the left hand)

It ends by listing any bar that still doesn't add up.
"""
import argparse
import sys
import xml.etree.ElementTree as ET
from fractions import Fraction

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst", nargs="?")
ap.add_argument("--dump", action="store_true")
ap.add_argument("--name")
ap.add_argument("--tempo", type=int)
ap.add_argument("--composer")
ap.add_argument("--arranger")
ap.add_argument("--dyn", default="")
ap.add_argument("--drop", default="")
ap.add_argument("--tie", action="append", default=[])
ap.add_argument("--fermata", action="append", default=[])
args = ap.parse_args()


def load(path):
    if path.endswith(".mxl"):
        import zipfile
        z = zipfile.ZipFile(path)
        inner = ET.fromstring(z.read("META-INF/container.xml")).find(".//{*}rootfile").get("full-path")
        return ET.ElementTree(ET.fromstring(z.read(inner)))
    return ET.parse(path)


tree = load(args.src)
root = tree.getroot()
part = root.find("part")
measures = part.findall("measure")
M = {m.get("number"): m for m in measures}

# Divisions per quarter can change along the way (Audiveris writes them again on each page).
beats, beat_type = int(root.findtext(".//time/beats")), int(root.findtext(".//time/beat-type"))
DIV, d = {}, None
for m in measures:
    d = int(m.findtext("attributes/divisions") or d)
    DIV[m.get("number")] = d
def bar_len(m): return DIV[m.get("number")] * 4 * beats // beat_type

STEPS = "CDEFGAB"


def dur(n): return int(n.findtext("duration") or 0)
def notes(m, staff): return [n for n in m.findall("note") if n.findtext("staff") == staff]
def heads(m, staff): return [n for n in notes(m, staff) if n.find("chord") is None and n.find("grace") is None]


def pitch(n):
    p = n.find("pitch")
    return None if p is None else (p.findtext("step"), int(p.findtext("alter") or 0), int(p.findtext("octave")))


def name(n):
    if n.find("rest") is not None:
        return "r"
    s, a, o = pitch(n)
    return s + {-1: "b", 1: "#", 0: "", 2: "##", -2: "bb"}[a] + str(o)


def voices(m, staff):
    """{voice: total length} for one hand, skipping chord notes and grace notes."""
    out = {}
    for n in heads(m, staff):
        out[n.findtext("voice")] = out.get(n.findtext("voice"), 0) + dur(n)
    return out


def dump():
    for m in measures:
        line = []
        for staff, hand in (("1", "RH"), ("2", "LH")):
            groups = {}
            for n in notes(m, staff):
                if n.find("grace") is not None:
                    continue
                v = groups.setdefault(n.findtext("voice"), [])
                tie = "~" if any(t.get("type") == "start" for t in n.findall("tie")) else ""
                if n.find("chord") is not None and v:
                    v[-1] = v[-1].replace(":", "." + name(n) + ":", 1)
                else:
                    v.append(f"{name(n)}:{Fraction(dur(n), DIV[m.get('number')])}{tie}")
            line.append(f"{hand}: " + " | ".join(" ".join(v) for v in groups.values()))
        print(f"{m.get('number'):>3} {line[0]}\n    {line[1]}")


if args.dump:
    dump()
    sys.exit()
if not args.dst or not args.name:
    ap.error("give the output path and --name")

# Beams on a chord's other notes.
for n in root.iter("note"):
    if n.find("chord") is not None:
        for b in n.findall("beam"):
            n.remove(b)

# Pedal marks, made-up dynamics, and markings asked to go.
drop = {d for d in args.drop.split(",") if d}
keep_dyn = {tuple(x.split(":")) for x in args.dyn.split(",") if x}
for m in measures:
    for d in m.findall("direction"):
        dyn = d.find("direction-type/dynamics")
        if d.find("direction-type/pedal") is not None or (keep_dyn and dyn is not None and (m.get("number"), dyn[0].tag) not in keep_dyn):
            m.remove(d)
    for n in m.findall("note"):
        no = n.find("notations")
        if no is None:
            continue
        for x in list(no):
            if x.tag in drop:
                no.remove(x)
            elif x.tag in ("articulations", "ornaments"):
                for a in list(x):
                    if a.tag in drop:
                        x.remove(a)
                if len(x) == 0:
                    no.remove(x)
        if len(no) == 0:
            n.remove(no)

# No part name ("Piano" on every line).
sp = root.find("part-list/score-part")
sp.find("part-name").text = None
for a in sp.findall("part-abbreviation"):
    sp.remove(a)

fixed = []
for m in measures:
    num = m.get("number")
    # A stray rest next to a whole-bar rest in the same hand.
    for staff in ("1", "2"):
        ns = notes(m, staff)
        whole = [n for n in ns if n.find("rest") is not None and n.find("rest").get("measure") == "yes"]
        if not whole or len(ns) == 1 or any(n.find("rest") is None for n in ns):
            continue
        for n in ns:
            if n is whole[0]:
                continue
            kids = list(m)
            nxt = kids[kids.index(n) + 1] if kids.index(n) + 1 < len(kids) else None
            m.remove(n)
            if nxt is not None and nxt.tag == "backup" and dur(nxt) == dur(n):
                m.remove(nxt)
        whole[0].find("voice").text = min(n.findtext("voice") for n in ns)
        fixed.append(f"bar {num}: stray rest by the whole-bar rest")

    # <backup d1><forward d2> with d1 ~ d2 inside one hand: the hand's next notes belong to the same voice.
    kids = list(m)
    for i, b in enumerate(kids[:-1]):
        f = kids[i + 1]
        if b.tag != "backup" or f.tag != "forward" or abs(dur(b) - dur(f)) > DIV[num] // 4 or i == 0:
            continue
        prev = next((k for k in reversed(kids[:i]) if k.tag == "note"), None)
        if prev is None or prev.findtext("staff") != f.findtext("staff"):
            continue
        v_old, v_new, gap = f.findtext("voice"), prev.findtext("voice"), dur(b) - dur(f)
        m.remove(b)
        m.remove(f)
        for k in kids[i + 2:]:
            if k.tag == "note" and k.findtext("staff") == f.findtext("staff") and k.findtext("voice") == v_old:
                k.find("voice").text = v_new
            if k.tag == "backup":  # the backup to the other hand was short by the same gap
                k.find("duration").text = str(dur(k) + gap)
                break
        fixed.append(f"bar {num}: hand {f.findtext('staff')}'s split voice merged")
        break

    # A note one length short: the hand is short by exactly what it lacks to match its neighbours.
    for staff in ("1", "2"):
        for v, total in voices(m, staff).items():
            short = bar_len(m) - total
            if short <= 0:
                continue
            hs = [n for n in heads(m, staff) if n.findtext("voice") == v]
            for i, n in enumerate(hs):
                near = [hs[j] for j in (i - 1, i + 1) if 0 <= j < len(hs)]
                if near and all(dur(x) == dur(n) + short for x in near) and n.find("beam") is not None:
                    x = near[0]
                    group, kids = [n], list(m)  # the note and its chord notes, if any
                    for k in kids[kids.index(n) + 1:]:
                        if k.tag != "note" or k.find("chord") is None:
                            break
                        group.append(k)
                    for g in group:
                        g.find("duration").text = str(dur(x))
                        g.find("type").text = x.findtext("type")
                    # the backup after this hand grows by the same amount
                    for k in kids[kids.index(n):]:
                        if k.tag == "backup":
                            k.find("duration").text = str(dur(k) + short)
                            break
                    fixed.append(f"bar {num}: hand {staff}'s {name(n)} lengthened to {x.findtext('type')}")
                    break


def where(spec):
    bar, _, staff = spec.partition(":")
    return M[bar], staff or "1"


def notations(n):
    no = n.find("notations")
    return no if no is not None else ET.SubElement(n, "notations")


def chord_at(m, staff, last):
    hs = heads(m, staff)
    head = hs[-1] if last else hs[0]
    kids = list(m)
    group = [head]
    for k in kids[kids.index(head) + 1:]:
        if k.tag != "note" or k.find("chord") is None:
            break
        group.append(k)
    return group


for spec in args.tie:
    m, staff = where(spec)
    nxt = measures[measures.index(m) + 1]
    end = chord_at(nxt, staff, last=False)
    for n in chord_at(m, staff, last=True):
        for e in end:
            if pitch(e) == pitch(n):
                for x, kind in ((n, "start"), (e, "stop")):
                    x.insert(list(x).index(x.find("duration")) + 1, ET.Element("tie", type=kind))
                    ET.SubElement(notations(x), "tied", type=kind)
    fixed.append(f"bar {spec}: tied into the next bar")

for spec in args.fermata:
    m, staff = where(spec)
    ET.SubElement(notations(chord_at(m, staff, last=True)[0]), "fermata", type="upright")

# Title, composer, arranger, tempo.
work = ET.Element("work")
ET.SubElement(work, "work-title").text = args.name
root.insert(0, work)
ident = root.find("identification")
for role in ("arranger", "composer"):
    if getattr(args, role):
        c = ET.Element("creator", type=role)
        c.text = getattr(args, role)
        ident.insert(0, c)
if args.tempo:
    first = measures[0]
    d = ET.fromstring(f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
                      f'<per-minute>{args.tempo}</per-minute></metronome></direction-type><staff>1</staff>'
                      f'<sound tempo="{args.tempo}" /></direction>')
    kids = list(first)
    at = kids.index(first.find("attributes")) + 1 if first.find("attributes") is not None else 0
    first.insert(at, d)

ET.indent(tree)
with open(args.dst, "wb") as fh:
    fh.write(b'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n')
    tree.write(fh, encoding="utf-8")

print("\n".join(fixed))
bad = [f"bar {m.get('number')} hand {s}: {Fraction(t, DIV[m.get('number')])} of {Fraction(bar_len(m), DIV[m.get('number')])} beats"
       for m in measures for s in ("1", "2") for t in voices(m, s).values() if t != bar_len(m)]
print("\n".join(["still wrong:"] + bad) if bad else f"{len(measures)} bars, every hand adds up")
