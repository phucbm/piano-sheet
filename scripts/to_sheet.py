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
  --easy         easy version: right hand exactly as played, left hand = ballad
                 pattern 1-5-8-10 in 8th notes on guessed chords, chord names on top
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


chords = []  # (onset, root pitch class, "major" | "minor") for chord names
if a.easy:
    # Right hand stays as played. Left hand plays the ballad pattern 1-5-8-10 in 8th
    # notes over a chord guessed per half bar from every note sounding in it (bass
    # note counts extra): 1 5 8 10 8 5 8 5 for a whole bar, 1 5 8 10 for a half bar.
    sounding = [(on, s["off"], m, h) for h in events for on, s in events[h].items() for m in s["pitches"]]
    end = max(off for _, off, _, _ in sounding)
    in_key = {p.pitchClass for p in k.getScale().getPitches()}
    guesses = []
    for start in range(0, end, 8):
        weight = np.zeros(12)
        for on, off, m, h in sounding:
            overlap = min(off, start + 8) - max(on, start)
            if overlap > 0:
                weight[m % 12] += overlap
        bass = [m for on, off, m, h in sounding if h == "lh" and on < start + 8 and off > start]
        best, best_score = None, 0
        for root in range(12):
            for quality, third in (("major", 4), ("minor", 3)):
                tones = {root, (root + third) % 12, (root + 7) % 12}
                score = sum(weight[t] for t in tones) - 0.5 * sum(weight[t] for t in range(12) if t not in tones)
                if not tones <= in_key:
                    score -= weight.sum() * 0.15  # prefer chords that belong to the key
                if bass and min(bass) % 12 == root:
                    score += weight.sum() * 0.3
                if score > best_score:
                    best, best_score = (root, quality), score
        guesses.append(best or (guesses[-1] if guesses else None))
    lh = {}
    for i, g in enumerate(guesses):
        start = i * 8
        if g is None or (i % 2 == 1 and guesses[i - 1] == g):
            continue  # second half of a bar with the same chord: the pattern goes on
        root, quality = g
        low = 40 + (root - 40) % 12  # root between E2 and Eb3, so the 10th stays near middle C
        whole = i % 2 == 0 and i + 1 < len(guesses) and guesses[i + 1] == g
        root_p = spell(low)  # pattern notes spelled from the root: E-B-E-G#, not E-B-E-Ab
        tenth = "M10" if quality == "major" else "m10"
        degree = {1: (0, root_p), 5: (7, root_p.transpose("P5")), 8: (12, root_p.transpose("P8")),
                  10: (12 + (4 if quality == "major" else 3), root_p.transpose(tenth))}
        for j, d in enumerate([1, 5, 8, 10, 8, 5, 8, 5] if whole else [1, 5, 8, 10]):
            step_up, p = degree[d]
            lh[start + 2 * j] = {"pitches": {low + step_up}, "off": start + 2 * j + 2, "spelled": [p]}
        chords.append((start, root, quality))
    events = {"rh": events["rh"], "lh": lh}


def build(hand, clef_obj, ks):
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


ks = key.KeySignature(sharps)

score = stream.Score()
score.insert(0, metadata.Metadata(title=a.title or a.out.split("/")[-1], composer="Auto-transcribed - check by ear"))
rh = build("rh", clef.TrebleClef(), ks)
lh = build("lh", clef.BassClef(), key.KeySignature(sharps))
score.insert(0, rh)
score.insert(0, lh)
score.insert(0, layout.StaffGroup([rh, lh], symbol="brace", barTogether=True))

score = score.makeNotation()
# Chord names go in after the bars exist; inserted earlier, music21 makes them a
# second voice and fills the bar with a rest.
for on, root, quality in chords:
    score.parts[0].measure(on // 16 + 1).insert((on % 16) / 4, harmony.ChordSymbol(root=pitch.Pitch(names[root]), kind=quality))
score.write("musicxml", fp=f"{a.out}.musicxml")
# Chord names are for reading only; music21 would play them, so drop them from the MIDI.
audio = score.flatten().getElementsNotOfClass(harmony.ChordSymbol).stream() if chords else score
audio.write("midi", fp=f"{a.out}.mid")
# Recording time of every sixteenth on the sheet (sixteenth 0 = start of bar 1), and the
# tempo the sheet plays at, so the player can keep the original video in step with it.
bars = -(-max(s["off"] for h in events.values() for s in h.values()) // 16)
grid_16ths = (np.arange(bars * 16 + 1) - a.shift + first) / sixteenths
timing = {"bpm": round(quarter_bpm), "sixteenths": np.round(np.interp(grid_16ths, np.arange(len(grid)), grid), 3).tolist()}
with open(f"{a.out}.timing.json", "w") as f:
    json.dump(timing, f, separators=(",", ":"))
print(f"key {k} ({sharps:+d}), ~{round(quarter_bpm)} BPM (quarter), half={half}, rh={len(events['rh'])} lh={len(events['lh'])} onsets")
print("wrote", f"{a.out}.musicxml", f"{a.out}.mid", f"{a.out}.timing.json")
