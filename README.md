# piano-sheet

Turn a piano video/recording into a two-hand sheet and practise it in the browser.

## Use

```sh
uv sync
mkdir -p models && curl -L -o models/piano_crnn.pth "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
scripts/run.sh input/song.mp4               # -> output/song.musicxml + .mid
scripts/run.sh input/song.mp4 --transpose -6 --easy  # easy version (set N so it lands in C)
python3 -m http.server 8000                 # open http://localhost:8000
```

`to_sheet.py` options: `--split 60` (pitch where the right hand starts), `--shift N`
(move bar lines by N sixteenths), `--half` (slow song, tracked beat = eighth), `--transpose N`,
`--easy` (right hand as played, left hand = ballad 1-5-8-10 on guessed chords, chord names on top).

## How

1. ffmpeg pulls the audio out.
2. ByteDance piano transcription (high-resolution onset/offset model) writes MIDI.
3. `to_sheet.py` tracks the beat with librosa, snaps notes to 16ths, splits hands at middle C,
   spells notes for the key, writes MusicXML.
4. `index.html` renders it with Verovio and plays it with html-midi-player, highlighting notes.

Open `output/*.musicxml` in MuseScore (free) to fix notes by hand.
