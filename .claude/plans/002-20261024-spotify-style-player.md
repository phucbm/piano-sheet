# 002: Spotify-style player with the original video and glass controls

Written: 2026-10-24. Status: Steps 1–4 done 2026-10-24, layout redone sheet-first the same day (see Revision; step 5 not started)
Related: plan 001 (the pipeline and the first player), perxel-web-2026 `app/custom.css` (glass reference)

## Goal

Redesign `index.html` into a music-player layout like Spotify's that works on phone, tablet and
desktop:

- the sheet is the main view and follows the music, like Spotify's synced lyrics;
- the original recording's video can be watched next to the sheet, in time with it;
- a single floating controller drives everything (one play button, one seek bar);
- minimal: plain icons, glass only on what floats over the sheet.

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

Sheet first: focus mode is the only mode. The sheet fills the screen, both side panels start
hidden, and the controls float over the sheet. (The first build had three columns and a docked
bar; see Revision.)

### Desktop (≥ 1100px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☰  vien-da-nho  original · 4/4 · ♩ = 72                                      │
│            ┌────────────────────────────────────────────────────┐            │
│            │  𝄞 ♩ ♩ ♪♪ ♩ │ ♩ ♩ ♩ ♩ │ ...    (current line)     │            │
│            │  𝄞 ♩ ♪♪ ♩ ♩ │ ...           (dimmed)           │            │
│            │                  sheet, full height                │            │
│            └────────────────────────────────────────────────────┘            │
│                                                          ┌────────────────┐  │
│                                                          │ video (▭ only) │  │
│                                                          └────────────────┘  │
│     ╭────────────────────────────────────────────────────────────────────╮   │
│     │ ┌──┐ vien-da-nho   │    ⏮   ( ▶ )   ⏭     │  1×  Aa  ♪  🔈━━  ▭ │   │
│     │ └──┘ original      │ 0:42 ━━━━●──────── 3:10 │                      │   │
│     ╰────────────────────────────────────────────────────────────────────╯   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **☰ (top left):** opens the library as a drawer over the sheet (songs grouped by recording,
  versions under each, the "trust your ears" hint at the bottom). Picking a song or clicking
  outside closes it.
- **Sheet:** a one-line header (name and meta read from the MusicXML), then the paper card.
  The current line stays near the centre, the others dim, scrolling by hand shows "Back to
  current".
- **Video:** off by default. ▭ shows it as a small floating card, bottom right above the
  controller, that can be dragged anywhere and closed with its ✕.
- **Controller:** floats 16px above the bottom, centred, at most 880px wide, the sheet scrolls
  under it. Three groups:
  - left: thumbnail, name, version;
  - centre: back one bar, play/pause, forward one bar, seek bar with times;
  - right: speed, note names, sound, mute + volume, video.

### Tablet (700–1099px)

Same layout; the name and the volume slider go (mute stays).

### Phone (< 700px)

```
┌──────────────────────────────┐
│ ☰  vien-da-nho  original     │
│  𝄞 ♩ ♩ ♪♪ ♩ │ ♩ ♩ ♩ ♩       │
│         sheet                │
│ ╭──────────────────────────╮ │
│ │ 0:42 ━━━━━●──────── 3:10 │ │
│ │ 1×  Aa   ⏮ ( ▶ ) ⏭   ♪  ▭ │ │
│ ╰──────────────────────────╯ │
└──────────────────────────────┘
```

No mini player, no tabs, no "⋯": the sheet is the default view and the controller floats in two
rows. The phone's own buttons set the volume. The video card is smaller (140px).

### Toggles, never dropdowns

Every setting is one button; one click steps to the next option. The button shows the current
option, turns red with a dot under it when not on the default, and a toast above the controller
says what it switched to for a moment.

| Button | One click goes to | Shows |
|---|---|---|
| Speed | 100% → 75% → 50% → 100% | `1×` / `.75×` / `.5×` |
| Note names | off → C D E → Do Re Mi → off | `Aa` / `CDE` / `Do` |
| Sound | Sheet → Original → Both → Sheet | note / waveform / both icons |
| Mute | on ↔ off | speaker icon |
| Video | card on ↔ off | camera icon |

## Visual style

Dark, music-app base: page `#121212`, panels `#181818`, text `#fff` / muted `#a7a7a7`. Font:
Manrope (as perxel-web), falling back to `system-ui`. Accent: the existing red `#e8442e` for
"playing now" (notes, current line, seek fill).

**Glass only on what floats over the sheet:** the controller, the video card and "Back to
current". Buttons inside the controller are plain grey icons that turn white on hover; the only
filled shape is the white play button. This is Perxel's `.px-glass` dark tone from
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
- No selects and no menus: settings are toggles (see Layout).

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
- ~~The video panel is open by default on desktop and tablet.~~ Now off by default; ▭ toggles
  the floating card (see Revision).

Choices made while building:

- In **Both**, the sheet is the leader and plays at 35% volume under the video. The video follows
  by nudging its `playbackRate` when it drifts more than 80 ms and jumps when it drifts more than
  0.5 s, so the piano sound is never cut by seeks. In **Original**, the video leads and the
  notes are lit from its time.
- Version names in the library are the slug minus the recording's
  slug (`original` when they are the same, `easy-in-C`); the full slug is the title and tooltip.
- Changing the speed re-renders the sheet (Verovio's `midiTempoAdjustment` needs it) and carries
  on from the same place.

Not checked in a browser in this session (static checks only): `node --check`, the highlight
check, and the files serving under Vite.

## Revision: sheet-first, minimal controls (2026-10-24)

The first build was not minimal: three columns, glass on every button, labelled dropdown pills,
a "⋯" panel, and a phone mini player with tabs. Redone to the Layout above:

- Library and Now playing columns removed; library is a ☰ drawer, video a floating card, both
  hidden by default. The Focus button is gone, because the sheet-only view is now the default.
- The bar floats over the sheet instead of being docked; its groups are left / centre / right.
- Speed, note names and sound are one-click toggles with a toast; the dropdown menus, the "⋯"
  panel, the phone mini player, its full-screen view and tabs are removed.
- Glass only on the controller, the video card and "Back to current"; plain icons in the bar.
- The "Now playing" version pills are gone (versions are in the library); the hint moved to the
  library's footer.

Checked: `node --check player.js`, the highlight check on both sheets. Not checked in a browser
in this session.
