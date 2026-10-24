---
name: sheet-from-picture
description: Add a song to the player from a printed sheet (an SVG, PDF or image of the score) instead of a recording - read the notes off the page into input/<name>.notes, turn it into output/<name>.musicxml with scripts/notes_to_sheet.py, check it against the original and add it to songs.json with no audio. Use when the user gives a sheet as a file ("add @song.svg", "add this PDF", a screenshot of a score) rather than a video or audio.
---

# Sheet from a picture

A song from a sheet has no recording: `songs.json` gets `{ "name": "<name>", "source": "" }` with
no `audio`/`video`, and the player plays the sheet's own sound (the Sound and Video controls are
hidden for it, no `timing.json` needed). First done for `DoiBo-QuiSaura` (Sibelius SVG, 16 bars).

## Steps

1. **Name**: the file's slug as it is (`DoiBo-QuiSaura.svg` → `DoiBo-QuiSaura`). Never invent a
   title or diacritics. Move the source into `input/` (`git mv <file> input/`).
2. **See the page.** Inkscape and `qlmanage` drop the embedded music fonts (boxes with `?`), so
   render with headless Chrome through an `<img>` at full width, then crop each system:
   ```sh
   echo '<html><body style="margin:0"><img src="file://'$PWD'/input/<file>.svg" style="width:3840px;display:block"></body></html>' > /tmp/s/v.html
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --allow-file-access-from-files \
     --screenshot=/tmp/s/page.png --window-size=3840,5431 file:///tmp/s/v.html   # height = width * viewBox h/w
   magick /tmp/s/page.png -crop 1850x780+300+780 -resize 1400x /tmp/s/s1a.png   # half a system at a time
   ```
   For a PDF: `magick -density 200 file.pdf[0] page.png`. For an image, just crop it.
3. **Exact pitches** (SVG from Sibelius): `python3 scripts/svg_notes.py input/<file>.svg` lists every
   notehead per bar and hand, with accidentals and rests. Trust it over your eyes. A chord read by
   eye in Đôi Bờ was wrong (Em7 for Dm). The pickup shows as bar 1 there. It knows Sibelius's Opus
   glyphs only. For another engraver (MuseScore uses SMuFL code points and `class="Note"`),
   check the glyph counts first (see "Other SVGs" below). No SVG: read pitches off the zoomed crops,
   counting staff lines and ledger lines.
4. **Write `input/<name>.notes`** (format in `scripts/notes_to_sheet.py`'s docstring): header
   (`name`, `key`, `time`, `tempo`, `pickup`, `repeat`, `lh-beams`), then one `rh:`/`lh:` pair
   per bar with a `# bar N` comment. Read lengths, dots, ties (`~`), triplets (`t`) and arpeggios
   (`a`) off the crops. Same pitch under an arc = a tie. Pickup bar = bar 0, and a hand with
   nothing in it gets a rest of the pickup's length (hidden when printed).
5. **Build**: `uv run python scripts/notes_to_sheet.py input/<name>.notes`. It stops on any
   bar that doesn't add up.
6. **Check against the original**: render with Verovio and screenshot it the same way, then
   compare it with the crops, system by system:
   ```sh
   uv run python -c "import verovio; tk=verovio.toolkit(); tk.setOptions({'pageWidth':2100,'pageHeight':2970,'scale':40,'adjustPageHeight':True}); tk.loadData(open('output/<name>.musicxml').read()); open('/tmp/s/vr.svg','w').write(tk.renderToSVG(1))"
   ```
   Then `uv run python scripts/check_highlight.py output/<name>.musicxml` (0 missed).
7. **Add it**: `{ "name": "<name>", "source": "" }` in `songs.json`, then `pnpm build`
   (copy-media must not complain; `/song/<name>/` must be listed).
8. Tell the user what the page covers (e.g. one page only, a repeat that opens but never
   closes) and that the sheet was typed in, not transcribed from audio.

## Other SVGs

Count the glyphs to see what engraved it:
```sh
python3 -c "import re,collections,sys; s=open(sys.argv[1],encoding='utf-8').read(); print(collections.Counter(re.findall(r'<text[^>]*>(.*?)</text>',s)).most_common(20))" file.svg
```
Sibelius (Opus): `` filled head, `` half head, `` flat, `` dot,
`` eighth rest, `` arpeggio piece. The most frequent glyph is almost always
the filled notehead. Add the new engraver's codes to `HEADS`/`ACCS`/`RESTS` in
`scripts/svg_notes.py`.
