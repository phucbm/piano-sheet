# 001: Piano recording to a two-hand sheet and a practice player

Written: 2026-10-24. Status: Done 2026-10-24

## Goal

Turn a video/recording of someone playing piano into sheet music a beginner can read, for
songs with no published sheet. Two versions per song:

- **Original**: both hands as played, in the key it was played.
- **Easy in C**: moved to C major; right hand exactly as played (no note dropped),
  left hand replaced by the ballad accompaniment 1-5-8-10 on guessed chords, with chord
  names above the staff.

Plus a browser player to read along, listen, slow down and compare with the recording.

## Pipeline (what was built)

| Step | Tool | File |
| --- | --- | --- |
| Video -> mono 16 kHz wav | ffmpeg | `scripts/run.sh` |
| Audio -> MIDI | ByteDance piano transcription (CRNN, `models/piano_crnn.pth`, downloaded from Zenodo, not in git) | `scripts/transcribe.py` |
| MIDI -> MusicXML + clean MIDI | librosa beat tracking, music21 | `scripts/to_sheet.py` |
| Read / play | Verovio (render + timemap) + html-midi-player, served by `python3 -m http.server 8000` | `index.html` |

`scripts/run.sh input/song.mp4 [options]` runs all three steps; then add the song to
`SONGS` in `index.html`.

### Decisions in `to_sheet.py`

- **Rhythm is guessed.** Beats are tracked in the audio; every note time is mapped onto
  that grid and snapped to 16ths. Tracked tempo > 100 is read as eighth notes (slow ballad),
  so ~129 tracked -> 4/4 at ~65 BPM.
- **Hands** split at middle C (`--split 60`).
- **Key** from music21 analysis; 6 sharps is written as 6 flats (Gb, not F#). Every note is
  spelled to fit the key signature (the default MIDI spelling mixed sharps and flats and was
  unreadable).
- `--transpose N` moves everything (Gb -> C is `-6`).
- `--easy`:
  - right hand untouched (checked note for note against the original: same pitches, offsets,
    lengths);
  - chord per half bar from every sounding note weighted by length, bass note counts extra,
    chords outside the key penalised (otherwise E beat Em in C);
  - left hand 1-5-8-10 in 8ths: `1 5 8 10 8 5 8 5` when the chord fills the bar,
    `1 5 8 10` per half when it changes; root kept between E2 and Eb3 so the 10th stays near
    middle C; notes spelled from the root (E-B-E-G#, not Ab);
  - chord names are inserted after `makeNotation()` (inserted before, music21 makes them a
    second voice and fills the bar with a whole rest, which Verovio draws as garbage), and are
    left out of the written MIDI (music21 would play them).
- `--shift N` moves bar lines by N sixteenths if the downbeat is wrong (not needed so far).

## What the user decided

- "Easy" means easy **left hand (hợp âm)**, never fewer right-hand notes. A melody-only right
  hand and held triads were both rejected as too easy.
- Left hand pattern = Vietnamese ballad **1-5-8-10**.
- Keep only two versions per song: original and easy-in-C.
- Commit the sources too (video + wav). The model stays out (170 MB, over GitHub's 100 MB).

## Done for the first song

`vien-da-nho` (64 s, Gb major, ~65 BPM, 16 bars + a tail bar):
`output/vien-da-nho.musicxml` / `.mid` and `output/vien-da-nho-easy-in-C.musicxml` / `.mid`.
Chords in C: C · C G · Em · Em G · Em F · F Em · C Dm · Dm G · C · C G · G Am · C G ·
Em F · F Em · Dm · Dm G. Bar 17 is the ringing tail (picked up a Bb chord) and can be skipped.

Verified offline (Verovio Python render to PNG, note-count and RH-identity checks). The
player page itself was not opened in a browser in this session.

## Known limits

- Rhythm may be a 16th off in places; hands are split by pitch, so crossovers land on the
  wrong staff.
- Chord guesses can be wrong; fix per bar on request.
- Title shows the file name (correct Vietnamese title not known).

## Next (if wanted)

- Open the player in a browser and check playback, highlighting and the speed control.
- A way to override chords per bar (e.g. `--chords "C,C G,Em,..."`) instead of editing code.
- Trim the tail bar automatically.
- Other left-hand patterns as options (1-5-8 only, broken 7th chords) if 1-5-8-10 gets old.
- Remove the unused `src/piano_sheet/__init__.py` stub that `uv init` created.
