# piano-sheet

Turn a piano video/recording into a two-hand sheet and practise it in the browser.

**Live demo: https://phucbm.github.io/piano-sheet/** ([easy version in C](https://phucbm.github.io/piano-sheet/song/vien-da-nho-easy-in-C/))

The player renders the sheet, plays it back at 50–100% speed, highlights the notes as they
sound and follows the current line, and plays the original video in step with the sheet
(sound from the sheet, the original, or both). Tap a note to jump to it. The sheet fills the
screen with one floating controller; the library (☰) and the video are hidden until you open
them. It works on phone, tablet and desktop.

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python 3.11+) and [ffmpeg](https://ffmpeg.org/)
- Node 22 and [pnpm](https://pnpm.io/) for the player

## Use

```sh
uv sync
mkdir -p models && curl -L -o models/piano_crnn.pth "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
scripts/run.sh input/song.mp4               # -> output/song.musicxml + .mid
scripts/run.sh input/song.mp4 --transpose -6 --easy  # easy version in 4 levels (set N so it lands in C)
pnpm install && pnpm dev                     # player on http://localhost:8000
uv run python scripts/check_highlight.py output/song.musicxml  # player highlights every note
```

`to_sheet.py` options: `--split 60` (pitch where the right hand starts), `--shift N`
(move bar lines by N sixteenths), `--half` (slow song, tracked beat = eighth), `--transpose N`,
`--easy` (right hand as played, left hand on guessed chords of the key, one per bar unless the
second half clearly changes, chord names on top; `--one-chord` keeps it to one per bar). If
most bars change chord on beat 3, the bar lines are half a bar off: add `--shift 8`. It writes
one sheet per left-hand level, `<out>.<level>.*`, easiest first: `root` (one held note), `fifth`
(root + fifth held), `broken` (1-5-8-5 in eighths, twice a bar, like the left hand of the
Canon_in_D and DoiBo-QuiSaura sheets), `ballad` (1-5-8-10-8-5-8-5 in eighths).

To add a song to the player, put `output/<name>.musicxml` and `output/<name>.timing.json`
(both written by `to_sheet.py`) and the recording `output/<audio>.wav` in place, and add it to
`songs.json`: `{ "name": "<name>", "audio": "<audio>.wav", "video": "<file in input/>", "source": "" }`
(leave out `video` if there is none). For an easy version add
`"levels": ["root", "fifth", "broken", "ballad"], "level": "fifth"` (the levels it has, and the one
a link opens with); the player's L1–L4 button switches between them. Then `scripts/thumb.sh <name>` makes the picture shown when
the song's link is shared. The timing file gives the recording time of every sixteenth on the
sheet, so the video stays in step even though the sheet plays at one fixed tempo. Every song gets
its own page, `/song/<name>/`; `pnpm dev` and `pnpm build` copy the files it uses into `public/media/`.

A song can also come from a printed sheet (SVG, PDF or image) with no recording: type its notes
into `input/<name>.notes` (`scripts/svg_notes.py` reads exact pitches from a Sibelius SVG), run
`uv run python scripts/notes_to_sheet.py input/<name>.notes` and add `{ "name": "<name>", "source": "" }`
to `songs.json`. The player then plays the sheet's own sound. Steps: `.claude/skills/sheet-from-picture/`.

## How

1. ffmpeg pulls the audio out.
2. ByteDance piano transcription (high-resolution onset/offset model) writes MIDI.
3. `to_sheet.py` tracks the beat with librosa, snaps notes to 16ths, splits hands at middle C,
   spells notes for the key, writes MusicXML.
4. The player (Next.js, exported as a static site; `lib/player/engine.ts`) renders it with
   Verovio and plays it with html-midi-player, highlighting notes, with the original video kept
   in step through `<name>.timing.json`.

Open `output/*.musicxml` in MuseScore (free) to fix notes by hand.

## Deploy

`.github/workflows/pages.yml` builds the player (`pnpm build`, a static export in `out/`) and
deploys it to GitHub Pages on every push to `main`; https://phucbm.github.io/piano-sheet/ updates
1–2 minutes later. Old links with `?song=<name>` still open the song.

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
