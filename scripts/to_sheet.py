"""Raw transcribed MIDI -> two-hand piano sheet (MusicXML + clean MIDI).

Rhythm is guessed: beats are tracked in the audio, every note time is mapped
onto that beat grid and snapped to 16th notes.

Usage:
  uv run python scripts/to_sheet.py output/song.wav output/song.raw.mid output/song
  -> output/song.musicxml, song.mid, and song.timing.json (recording time of each 16th)
Options:
  --split 60     MIDI pitch where the right hand starts (60 = middle C)
  --half         tracked beat is an eighth note (slow song); auto when tempo > 100
  --shift 0      move the bar lines by N sixteenths if the downbeat looks wrong
  --transpose 0  move every note by N semitones (e.g. to an easier key)
  --easy         easy version: right hand exactly as played, left hand on guessed chords
                 (one per bar), chord names on top. Writes one sheet per left-hand level:
                 <out>.root / .fifth / .broken / .ballad (.musicxml, .mid, .timing.json)
  --one-chord    with --easy: always one chord per bar, never two
  --title "..."
"""
import argparse
import json

import librosa
import numpy as np
import pretty_midi
from music21 import chord, clef, harmony, key, layout, meter, metadata, note, pitch, stream, tempo

p = argparse.ArgumentParser()
p.add_argument("wav")
p.add_argument("mid")
p.add_argument("out")
p.add_argument("--split", type=int, default=60)
p.add_argument("--half", action="store_true")
p.add_argument("--shift", type=int, default=0)
p.add_argument("--transpose", type=int, default=0)
p.add_argument("--easy", action="store_true")
p.add_argument("--one-chord", action="store_true")
p.add_argument("--title", default="")
a = p.parse_args()

# Beat grid from the audio, extended past both ends at the median spacing.
y, sr = librosa.load(a.wav, sr=22050)
bpm, frames = librosa.beat.beat_track(y=y, sr=sr)
beats = librosa.frames_to_time(frames, sr=sr)
step = float(np.median(np.diff(beats)))
half = a.half or float(np.atleast_1d(bpm)[0]) > 100
pre = np.arange(beats[0] - step, -step, -step)[::-1]
post = np.arange(beats[-1] + step, len(y) / sr + 2 * step, step)
grid = np.concatenate([pre, beats, post])

per_quarter = 2 if half else 1  # tracked beats per quarter note
sixteenths = 4 // per_quarter  # grid points per tracked beat


def to_16th(t):
    """Seconds -> position in 16th notes, snapped."""
    b = np.interp(t, grid, np.arange(len(grid)))
    return int(round(b * sixteenths))


notes = pretty_midi.PrettyMIDI(a.mid).instruments[0].notes
for n in notes:
    n.pitch += a.transpose
first = min(to_16th(n.start) for n in notes)
events = {"rh": {}, "lh": {}}
for n in notes:
    on = to_16th(n.start) - first + a.shift
    off = max(to_16th(n.end) - first + a.shift, on + 1)
    hand = "rh" if n.pitch >= a.split else "lh"
    slot = events[hand].setdefault(on, {"pitches": set(), "off": off})
    slot["pitches"].add(n.pitch)
    slot["off"] = max(slot["off"], off)

quarter_bpm = 60 / (step * per_quarter)

# Key from all pitches; 6 sharps is written as 6 flats (Gb, not F#).
probe = stream.Stream([note.Note(n.pitch, quarterLength=n.end - n.start) for n in notes])
k = probe.analyze("key")
sharps = -6 if k.sharps >= 6 else k.sharps
names = (["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] if sharps > 0
         else ["C", "D-", "D", "E-", "E", "F", "G-", "G", "A-", "A", "B-", "C-" if sharps <= -6 else "B"])


def spell(midi):
    """MIDI number -> pitch spelled to fit the key signature."""
    name = names[midi % 12]
    octave = midi // 12 - 1 + (1 if name == "C-" else 0)
    return pitch.Pitch(f"{name}{octave}")


# Easy versions' left hand, easiest first. Each one is written to <out>.<level>.musicxml.
LEVELS = {
    "root": "one held root note per chord",
    "fifth": "root + fifth held together",
    "broken": "1-5-8-5 in quarter notes",
    "ballad": "1-5-8-10-8-5-8-5 in 8th notes",
}

spans = []  # (onset, length in 16ths, (root pitch class, "major" | "minor")), one per chord
if a.easy:
    # Right hand stays as played. The left hand plays a pattern (LEVELS) over chords of the
    # key guessed from every note sounding (bass note counts extra): one chord per bar,
    # two only when the second half clearly wants another one (never with --one-chord).
    sounding = [(on, s["off"], m, h) for h in events for on, s in events[h].items() for m in s["pitches"]]
    end = max(off for _, off, _, _ in sounding)
    in_key = {p.pitchClass for p in k.getScale().getPitches()}
    QUALITIES = (("major", 4), ("minor", 3))

    def window(start, length):
        weight = np.zeros(12)
        for on, off, m, h in sounding:
            overlap = min(off, start + length) - max(on, start)
            if overlap > 0:
                weight[m % 12] += overlap
        bass = [m for on, off, m, h in sounding if h == "lh" and on < start + length and off > start]
        return weight, bass

    def fit(w, g):
        weight, bass = w
        root, quality = g
        tones = {root, (root + dict(QUALITIES)[quality]) % 12, (root + 7) % 12}
        score = sum(weight[t] for t in tones) - 0.5 * sum(weight[t] for t in range(12) if t not in tones)
        if bass and min(bass) % 12 == root:
            score += weight.sum() * 0.3
        return score

    key_chords = [(root, q) for root in range(12) for q, third in QUALITIES
                  if {root, (root + third) % 12, (root + 7) % 12} <= in_key]

    def best(w):
        g = max(key_chords, key=lambda g: fit(w, g))
        return g if fit(w, g) > 0 else None

    prev = None
    for bar in range(0, end, 16):
        w1, w2 = window(bar, 8), window(bar + 8, 8)
        g1, g2 = best(w1), best(w2)
        if not a.one_chord and g1 and g2 and g1 != g2 and fit(w2, g2) - fit(w2, g1) > 0.5 * w2[0].sum():
            halves = [(bar, 8, g1), (bar + 8, 8, g2)]
        else:
            halves = [(bar, 16, best(window(bar, 16)) or prev)]
        for start, length, g in halves:
            if g:
                spans.append((start, length, g))
                prev = g


def left_hand(level):
    """The easy left hand at one level, over the guessed chords."""
    lh, low = {}, 48
    for start, length, (root, quality) in spans:
        if level == "ballad":
            low = 40 + (root - 40) % 12  # root between E2 and Eb3, so the 10th stays near middle C
        else:  # root between F2 and G3, nearest the last one, so the hand hardly moves
            low = min((m for m in range(41, 56) if m % 12 == root), key=lambda m: abs(m - low))
        root_p = spell(low)  # pattern notes spelled from the root: E-B-E-G#, not E-B-E-Ab
        tenth = "M10" if quality == "major" else "m10"
        degree = {1: (0, root_p), 5: (7, root_p.transpose("P5")), 8: (12, root_p.transpose("P8")),
                  10: (12 + (4 if quality == "major" else 3), root_p.transpose(tenth))}
        notes = {  # (offset, length, degrees) in 16ths
            "root": [(0, length, [1])],
            "fifth": [(0, length, [1, 5])],
            "broken": [(4 * j, 4, [d]) for j, d in enumerate([1, 5, 8, 5][:length // 4])],
            "ballad": [(2 * j, 2, [d]) for j, d in enumerate([1, 5, 8, 10, 8, 5, 8, 5][:length // 2])],
        }[level]
        for at, dur, ds in notes:
            lh[start + at] = {"pitches": {low + degree[d][0] for d in ds}, "off": start + at + dur,
                              "spelled": [degree[d][1] for d in ds]}
    return lh


def build(events, hand, clef_obj, ks):
    part = stream.PartStaff()
    part.append(clef_obj)
    part.append(ks)
    part.append(meter.TimeSignature("4/4"))
    if hand == "rh":
        part.append(tempo.MetronomeMark(number=round(quarter_bpm)))
    onsets = sorted(events[hand])
    for i, on in enumerate(onsets):
        slot = events[hand][on]
        # A note lasts until the next one in the same hand (pedal covers the rest).
        end = slot["off"]
        if i + 1 < len(onsets):
            end = min(end, onsets[i + 1])
        dur = max(end - on, 1) / 4  # quarterLength
        pitches = sorted(slot["pitches"])
        spelled = slot.get("spelled") or [spell(m) for m in pitches]
        el = note.Note(spelled[0]) if len(spelled) == 1 else chord.Chord(spelled)
        el.quarterLength = dur
        part.insert(on / 4, el)
    return part


def write(out, events, chords):
    """Sheet, MIDI and timing for one set of events."""
    ks = key.KeySignature(sharps)
    score = stream.Score()
    score.insert(0, metadata.Metadata(title=a.title or a.out.split("/")[-1], composer="Auto-transcribed - check by ear"))
    rh = build(events, "rh", clef.TrebleClef(), ks)
    lh = build(events, "lh", clef.BassClef(), key.KeySignature(sharps))
    score.insert(0, rh)
    score.insert(0, lh)
    score.insert(0, layout.StaffGroup([rh, lh], symbol="brace", barTogether=True))

    score = score.makeNotation()
    # Chord names go in after the bars exist; inserted earlier, music21 makes them a
    # second voice and fills the bar with a rest.
    for on, root, quality in chords:
        score.parts[0].measure(on // 16 + 1).insert((on % 16) / 4, harmony.ChordSymbol(root=pitch.Pitch(names[root]), kind=quality))
    score.write("musicxml", fp=f"{out}.musicxml")
    # Chord names are for reading only; music21 would play them, so drop them from the MIDI.
    audio = score.flatten().getElementsNotOfClass(harmony.ChordSymbol).stream() if chords else score
    audio.write("midi", fp=f"{out}.mid")
    # Recording time of every sixteenth on the sheet (sixteenth 0 = start of bar 1), and the
    # tempo the sheet plays at, so the player can keep the original video in step with it.
    bars = -(-max(s["off"] for h in events.values() for s in h.values()) // 16)
    grid_16ths = (np.arange(bars * 16 + 1) - a.shift + first) / sixteenths
    timing = {"bpm": round(quarter_bpm), "sixteenths": np.round(np.interp(grid_16ths, np.arange(len(grid)), grid), 3).tolist()}
    with open(f"{out}.timing.json", "w") as f:
        json.dump(timing, f, separators=(",", ":"))


# Chord names on the sheet: only where the chord changes.
chords = [(start, *g) for i, (start, _, g) in enumerate(spans) if i == 0 or spans[i - 1][2] != g]
outs = {f"{a.out}.{level}": {"rh": events["rh"], "lh": left_hand(level)} for level in LEVELS} if a.easy else {a.out: events}
for out, ev in outs.items():
    write(out, ev, chords)
    print(f"{out}: rh={len(ev['rh'])} lh={len(ev['lh'])} onsets")
print(f"key {k} ({sharps:+d}), ~{round(quarter_bpm)} BPM (quarter), half={half}" + (f", {len(spans)} chords" if a.easy else ""))
