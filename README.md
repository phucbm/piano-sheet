# piano-sheet

Turn a piano video/recording into a two-hand sheet and practise it in the browser.

**Live demo: https://phucbm.github.io/piano-sheet/** ([easy version in C](https://phucbm.github.io/piano-sheet/?song=vien-da-nho-easy-in-C))

The player renders the sheet, plays it back at 50–100% speed, highlights the notes as they
sound, and lets you compare with the original recording.

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python 3.11+) and [ffmpeg](https://ffmpeg.org/)
- [pnpm](https://pnpm.io/) for the local player (optional — any static file server works)

## Use

```sh
uv sync
mkdir -p models && curl -L -o models/piano_crnn.pth "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
scripts/run.sh input/song.mp4               # -> output/song.musicxml + .mid
scripts/run.sh input/song.mp4 --transpose -6 --easy  # easy version (set N so it lands in C)
pnpm install && pnpm dev                     # serves + opens http://localhost:8000
uv run python scripts/check_highlight.py output/song.musicxml  # player highlights every note
```

`to_sheet.py` options: `--split 60` (pitch where the right hand starts), `--shift N`
(move bar lines by N sixteenths), `--half` (slow song, tracked beat = eighth), `--transpose N`,
`--easy` (right hand as played, left hand = ballad 1-5-8-10 on guessed chords, chord names on top).

To add a song to the player, put `output/<name>.musicxml` (and the recording as
`output/<audio>.wav`) in place and add it to `SONGS` in `index.html`.

## How

1. ffmpeg pulls the audio out.
2. ByteDance piano transcription (high-resolution onset/offset model) writes MIDI.
3. `to_sheet.py` tracks the beat with librosa, snaps notes to 16ths, splits hands at middle C,
   spells notes for the key, writes MusicXML.
4. `index.html` renders it with Verovio and plays it with html-midi-player, highlighting notes.

Open `output/*.musicxml` in MuseScore (free) to fix notes by hand.

## Deploy

The player is a single static `index.html`, served from the `main` branch root by GitHub Pages.
Every push to `main` redeploys https://phucbm.github.io/piano-sheet/.

## Contributing

Issues and pull requests are welcome. Run `scripts/check_highlight.py` on any sheet you change
so the player still highlights every note.

## Credits

- [piano_transcription_inference](https://github.com/qiuqiangkong/piano_transcription_inference) (ByteDance high-resolution piano transcription)
- [librosa](https://librosa.org/), [music21](https://web.mit.edu/music21/), [pretty_midi](https://github.com/craffel/pretty-midi)
- [Verovio](https://www.verovio.org/) and [html-midi-player](https://github.com/cifkao/html-midi-player)

## License

Code is [MIT](LICENSE). The example recording in `input/` and the audio and sheets made from it
in `output/` are included for the demo only and remain the property of their original authors.
