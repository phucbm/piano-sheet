---
name: sheet-from-picture
description: Add a song to the player from a printed sheet (an SVG, PDF or image of the score) instead of a recording - an engraved PDF/image goes through Audiveris (OMR) and scripts/omr_clean.py, anything else is read off the page into input/<name>.notes and built with scripts/notes_to_sheet.py; then check it against the original and add it to songs.json with no audio. Use when the user gives a sheet as a file ("add @song.svg", "add this PDF", a screenshot of a score) rather than a video or audio.
---

# Sheet from a picture

A song from a sheet has no recording: `songs.json` gets `{ "name": "<name>", "source": "" }` with
no `audio`/`video`, and the player plays the sheet's own sound (the Sound and Video controls are
hidden for it, no `timing.json` needed).

Pick the route by the file:
- **A. OMR (Audiveris)**: a clean PDF or image exported by MuseScore, Sibelius, Finale, Dorico
  (crisp engraving, `pdfinfo` often names the program). Fast for long pieces. First done for
  `Canon_in_D` (MuseScore PDF, 3 pages, 53 bars): Audiveris got every pitch right, and what it got
  wrong was voices, one tie, and markings made out of pedal marks.
- **B. Typed in**: an SVG (exact pitches from `svg_notes.py`), a handwritten or photographed page,
  or when OMR comes back a mess. First done for `DoiBo-QuiSaura` (Sibelius SVG, 16 bars).

Both: **name** = the file's slug as it is (`Canon_in_D.pdf` → `Canon_in_D`), never an invented
title or diacritics. Move the source into `input/` (`git mv <file> input/`). The user doesn't fix
anything by hand: install what's needed and do it all.

## A. OMR with Audiveris

1. **Install once** (not in Homebrew; the .dmg brings its own Java). The dmg shows a licence
   prompt, so pipe `yes` into attach:
   ```sh
   test -x ~/.local/opt/Audiveris.app/Contents/MacOS/Audiveris || {
     v=$(curl -s https://api.github.com/repos/Audiveris/audiveris/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4)
     mkdir -p /tmp/audiveris-dl ~/.local/opt && cd /tmp/audiveris-dl
     curl -sSL -o a.dmg "https://github.com/Audiveris/audiveris/releases/download/$v/Audiveris-$v-macosx-$(uname -m).dmg"
     yes | hdiutil attach -nobrowse -mountpoint /tmp/audiveris-dl/mnt a.dmg >/dev/null
     cp -R mnt/Audiveris.app ~/.local/opt/ && hdiutil detach -quiet mnt; cd -; }
   ```
2. **Read it** (about a minute for 3 pages), into its own folder in `/tmp`:
   ```sh
   mkdir -p /tmp/omr && ~/.local/opt/Audiveris.app/Contents/MacOS/Audiveris -batch -export -output /tmp/omr -- input/<file>.pdf
   ```
   → `/tmp/omr/<file>.mxl`.
3. **See the page**: `pdftoppm -r 150 -png input/<file>.pdf /tmp/omr/pg`, then crop one system
   at a time (PIL via `uv run --with pillow`) and Read the crops. 150 dpi is enough to read ties,
   accidentals and articulations; the page-sized Read of a PDF is not.
4. **List what it read**: `uv run python scripts/omr_clean.py /tmp/omr/<file>.mxl --dump` prints
   every bar as `RH:`/`LH:` text (`D5.F#5:1/2` = chord, eighth; `~` tie; `|` between voices).
   Go system by system against the crops. Also count the markings it made:
   dynamics per bar, `fermata`, `staccato`, `accent`, `strong-accent`, `slur`, `wedge`, `pedal`.
   Typical Audiveris misreads on a clean PDF (all seen in Canon_in_D):
   - a hand's first beat split into its own voice, the bar's other hand then a sixteenth short;
   - a stray rest beside a whole-bar rest;
   - an eighth read as a sixteenth (the bar comes out a sixteenth short);
   - a tie missing across a bar line (the same notes under an arc in the crop);
   - pedal marks (Ped. / ✱) read as slurs, staccato dots, fermatas, accents and extra dynamics
     (`ff`, `sf`, `p p p`). The natural sound plays dynamics, so these change the sound;
   - not read at all: tempo mark, title, composer, rit., grace notes, often the real fermata;
   - "Piano" printed on every system (part name and abbreviation).
5. **Clean it**: the first four misreads above are fixed on their own; the rest are options
   (see the docstring):
   ```sh
   uv run python scripts/omr_clean.py /tmp/omr/<file>.mxl output/<name>.musicxml --name <name> \
     --tempo 70 --composer "…" --arranger "…" \
     --dyn 1:p,5:mp,9:mf --drop slur,staccato,accent,fermata,breath-mark --tie 25 --fermata 52
   ```
   `--dyn` keeps only the dynamics printed in the PDF; `--drop` only what the PDF really has none
   of (Canon had no slurs or dots, but kept its 19 `strong-accent`s). It prints what it fixed and
   any bar that still doesn't add up; fix those by editing the XML, then `--dump` again.
6. Then **Check** and **Add it** below (steps 6 to 8 of B). Verovio *crashed* (exit 139, no
   message) on Audiveris' raw output because of beams on chord notes: `omr_clean.py` drops them,
   so `check_highlight.py` printing nothing means the file is still raw.

## B. Typed in


1. **Name** and `input/`: see above.
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
   (copy-media must not complain; `/song/<name>/` must be listed). A running `pnpm dev` serves
   copies in `public/media/` made when it started: after changing a sheet, run
   `node scripts/copy-media.mjs` or the page shows the old one.
   To see the page without the user's Chrome, screenshot it with headless Playwright (the
   Chromium in `~/Library/Caches/ms-playwright/chromium_headless_shell-*`), on `?view=sheet` and
   `?view=keys`, and log `pageerror`. A blank page with no error was a CSS clash once
   (`body.no-video` vs `.no-video`), so look at the screenshot, not just the log.
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
