# 002: Spotify-style player with the original video and glass controls

Written: 2026-10-24. Status: Steps 1–4 done 2026-10-24 (step 5 not started)
Related: plan 001 (the pipeline and the first player), perxel-web-2026 `app/custom.css` (glass reference)

## Goal

Redesign `index.html` into a music-player layout like Spotify's that works on phone, tablet and
desktop:

- the sheet is the main view and follows the music, like Spotify's synced lyrics;
- the original recording's video can be watched next to the sheet, in time with it;
- a single bottom bar controls everything (one play button, one seek bar);
- every clickable element uses Perxel's glass material.

Not in scope: changes to the transcription pipeline, except the timing file in step 4.

## Rules

- **Names come from the file.** A song shows as its `SONGS` name, the file slug
  (`vien-da-nho`, `vien-da-nho-easy-in-C`), exactly as written. No guessed titles, diacritics or
  translations. An optional `title` field in `SONGS`, written by the user, may replace it later.
- It stays a static site served by GitHub Pages from `main`, with no build step. The page may be
  split into `index.html` + `player.css` + `player.js` (all served as they are, and `pnpm dev`
  still works).
- Keep the `playing` class and `data-note` labels so `scripts/check_highlight.py` still passes.
- The score stays black on a light paper card, because notation on dark is hard to read.

## Layout

### Desktop (≥ 1100px): library | sheet | now playing, plus a bottom bar

```
┌────────────┬─────────────────────────────────┬──────────────┐
│ LIBRARY    │  vien-da-nho                    │ NOW PLAYING  │
│            │  Original · 4/4 · ♩=…           │ ┌──────────┐ │
│ vien-da-nho│ ─────────────────────────────── │ │  video   │ │
│  • original│ ┌─────────── paper ───────────┐ │ │ portrait │ │
│  • easy-in-C│ │ current line highlighted,  │ │ │  9:16    │ │
│            │ │ others dimmed, auto-scroll  │ │ └──────────┘ │
│            │ └─────────────────────────────┘ │ versions     │
│            │                                 │ hint / credit│
├────────────┴─────────────────────────────────┴──────────────┤
│ [thumb] vien-da-nho  ⏪ ▶ ⏩  0:42 ━━━●──── 1:04  🎹|🎬  75%  Aa  🔊  ⛶ │
└─────────────────────────────────────────────────────────────┘
```

- **Library (left, about 240px):** songs grouped by their source recording (`audio`), with the
  versions under each. Can collapse to an icon rail.
- **Sheet (centre):** a header with the name and meta (version, time signature and tempo read
  from the MusicXML), then the paper card. The line being played stays near the centre and the
  other lines are dimmed a little. Scrolling by hand pauses auto-follow and shows a glass
  "Back to current" pill.
- **Now playing (right, about 320px):** the original video (`input/vien-da-nho.MP4` is
  576×1024 portrait H.264, 3.6 MB, and plays in the browser as it is), the version switcher, and
  the "auto-transcribed, trust your ears" hint. It can be closed. It shows the song's thumbnail
  and no video when a song has none.
- **Bottom bar (fixed, glass):**
  - Left: thumbnail (the video's poster frame) and name.
  - Centre: play/pause, back one bar / forward one bar, seek bar with current time and length.
  - Right:
    - source toggle **Sheet / Original / Both** (in Both, the sheet sound is muted under the
      video);
    - speed 50 / 75 / 100%;
    - note names Off / C D E / Do Re Mi;
    - volume;
    - focus mode, which hides both side panels.

### Tablet (700–1100px)

The library becomes a drawer behind a ☰ button. Now playing becomes a floating video card in a
corner that can be dragged, made smaller, or closed.

### Phone (< 700px)

- A mini player sits at the bottom: name, play button, and a thin progress line along its top
  edge.
- Tapping it opens a full-screen view that slides up, with tabs **Sheet | Video | Library**.
  The full transport is on top and it closes with a swipe down.
- Speed, note names and source go into a "⋯" bottom sheet.
- The sheet re-renders when the width or orientation changes (debounced). It already sizes
  itself from `clientWidth`.

## Visual style

Dark, music-app base: page `#121212`, panels `#181818`, text `#fff` / muted `#a7a7a7`. Font:
Manrope (as perxel-web), falling back to `system-ui`. Accent: the existing red `#e8442e` for
"playing now" (notes, current line, seek fill).

**Glass on every clickable element** (buttons, selects, pills, library rows on hover, bottom
bar, floating video card, drawer). This is Perxel's `.px-glass` dark tone from
`perxel-web-2026/app/custom.css`, copied as plain CSS:

```css
.glass {
  --glass-fg: #fff;
  --glass-fill: rgba(255, 255, 255, .16);
  --glass-edge: rgba(255, 255, 255, .35);
  --glass-hi: rgba(255, 255, 255, .55);
  color: var(--glass-fg);
  background: var(--glass-fill);
  -webkit-backdrop-filter: blur(14px) saturate(1.8);
  backdrop-filter: blur(14px) saturate(1.8);
  box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1.5px 0 var(--glass-hi);
}
@media (hover: hover) { .glass:hover { --glass-fill: rgba(255, 255, 255, .28); } }
.glass:focus-visible { --glass-fill: rgba(255, 255, 255, .28); }
```

- Over the light paper card (the "Back to current" pill, buttons on the sheet), use the light
  tone: fill `rgba(245, 242, 239, .7)`, edge `rgba(0, 0, 0, .1)`, highlight
  `rgba(255, 255, 255, .9)`, text `#111`, and hover fill `.92`.
- For the main play button only, perxel-web's `.px-liquid` lens could be used (top rim, lighter
  top half, soft inner glow) so it stands out. Optional.
- Pills and round icon buttons: radius 999px. Panels: 12–16px. The seek bar's handle appears on
  hover or drag.
- Selects become glass buttons that open a small glass menu, because a native `<select>`
  can't be styled as glass.

## Playback model

- `html-midi-player` stays the sheet's sound engine. Its own UI is hidden, and our bar drives it
  with `start()`, `stop()`, `currentTime` and `duration`, and listens to its `note` and `stop`
  events, as the page does now.
- The `<video>` replaces the `<audio id="orig">`. The video is the "Original" source, and
  `output/<audio>.wav` is only a fallback when a song has no video.
- `SONGS` gets an optional `video` field:
  `{ name: "vien-da-nho", audio: "vien-da-nho", video: "input/vien-da-nho.MP4" }`.
- A single clock: whichever source is audible is the master, and the other follows it, so its
  position is corrected when it drifts more than about 80 ms.
- Speed applies to both: Verovio's `midiTempoAdjustment` for the sheet, and `video.playbackRate`
  for the video (browsers keep the pitch).

### Sheet time ↔ recording time

The sheet plays at one fixed tempo (`MetronomeMark(quarter_bpm)`), but the recording follows the
beats librosa tracked, which speed up and slow down. A straight seconds-to-seconds match drifts.

- **Step 3 (first version):** scale linearly from the first note to the last. Good enough to
  watch the hands.
- **Step 4 (exact):** `to_sheet.py` also writes `output/<name>.timing.json`, with the time in the
  recording of every sixteenth on the grid (the `grid` array it already builds, after `--shift`,
  `--half` and the lead-in). The player maps sheet time → sixteenth → recording seconds, and
  back again. `--transpose` / `--easy` keep the grid, so both versions share it.
- With that in place, tapping any note seeks both the sheet and the video to it.

## Steps

1. **Shell and style.** Dark base, glass class, desktop/tablet/phone layout, library built from
   `SONGS`, paper card, and the sheet re-rendering on resize. The old controls are moved in, not
   rewritten.
2. **Bottom bar.** Own transport over the hidden midi-player: play/pause, seek, time, bar
   back/forward, speed, note names, volume, `Space` / `←` / `→` shortcuts. The current line is
   highlighted and followed, with "Back to current".
3. **Video.** The `video` field, the Now playing panel / floating card / Video tab, the source
   toggle, the shared clock with the linear mapping, and the poster frame as the thumbnail.
4. **Exact sync.** `timing.json` from `to_sheet.py`, the mapping in the player, tap a note to
   seek. Update the README ("To add a song…") and plan 001's player row.
5. **Later, if wanted:** A–B loop over bars, play or dim one hand, count-in, `&speed=` and `&t=`
   in the URL.

## Checks

- `uv run python scripts/check_highlight.py output/vien-da-nho.musicxml` and the easy version
  still pass.
- `pnpm dev`, then try 1440, 1024, 768, 390 and 375 wide (portrait and landscape): no horizontal
  scroll, controls at least 44px on touch, glass readable over both the dark panels and the
  paper.
- Play in each source mode at 50 / 75 / 100%: the notes light up, and the video stays with the
  sheet (by eye after step 3, within about 100 ms per bar after step 4).
- Safari: `-webkit-backdrop-filter` works, and the video plays inline on iPhone (`playsinline`,
  `muted` until the user turns on sound).
- The live page on GitHub Pages loads the video from `input/` (it is committed).

## Open questions

- Accent: keep the red `#e8442e`, or use Perxel blue `#082ae5`, with red only for the notes
  playing now?
- Use the liquid lens on the main play button, or plain glass everywhere?
- Should the video panel be open by default on desktop, or only when the source is Original or
  Both?

## Done (2026-10-24)

Steps 1–4 are in `index.html`, `player.css`, `player.js`, plus `to_sheet.py` writing
`output/<name>.timing.json` (both current sheets reproduce exactly with default options, so only
the timing files were added; the sheets themselves are unchanged).

Decisions on the open questions (defaults, easy to change):

- Accent stays red `#e8442e`, used for the notes playing now and the seek fill on hover.
- Plain glass everywhere. The play button is the same glass with a near-white fill, no lens.
- The video panel is open by default on desktop and tablet; the 🎬 button in the bar toggles it.

Choices made while building:

- In **Both**, the sheet is the leader and plays at 35% volume under the video. The video follows
  by nudging its `playbackRate` when it drifts more than 80 ms and jumps when it drifts more than
  0.5 s, so the piano sound is never cut by seeks. In **Original**, the video leads and the
  notes are lit from its time.
- Version names in the library and the "Now playing" pills are the slug minus the recording's
  slug (`original` when they are the same, `easy-in-C`); the full slug is the title and tooltip.
- On tablet and phone, Sound / Speed / Note names / Volume move into the "⋯" panel (a bottom
  sheet on phone), where each shows its options as a row of glass pills.
- Changing the speed re-renders the sheet (Verovio's `midiTempoAdjustment` needs it) and carries
  on from the same place.

Not checked in a browser in this session (static checks only): `node --check`, the highlight
check, and the files serving under Vite.
