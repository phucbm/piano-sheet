# 006: Falling notes on a piano keyboard (an extra view)

Written: 2026-10-24. Status: Not started
Related: plan 002 (the player), the easy levels (commit 394b98a).

## Goal

A second view of the song in the style of YouTube piano tutorials (Synthesia). Notes fall
as bars onto a piano keyboard, and each key lights up while its note sounds. It's an
**extra mode**. The sheet stays the default and nothing about it changes.

- **Phone (< 700px):** the keys replace the sheet while the mode is on (layout A).
- **Wide screens (≥ 700px):** the sheet stays on top and the keys sit under it (layout B).

```
 Phone (A)                         Wide (B)
┌────────────────────────┐        ┌──────────────────────────────────┐
│ title                  │        │ title                            │
│      ██        ██      │        │ 𝄞 ─●──●───[●]──●──────── sheet   │
│  ▓▓  ██   ██           │        │ 𝄢 ──●───────●──────────          │
│  ▓▓       ██     ██    │        ├──────────────────────────────────┤
│  ▓▓  ██   ██     ██    │        │   ██      ▓▓     ██     falling  │
├┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┤        ├┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┤
│▓▓┴┴┴┴┴▒▒┴┴┴┴┴┴┴┴▒▒┴┴┴┴┴│        │┴┴┴▒▒┴┴┴┴┴┴┴┴┴┴┴▓▓┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴│
└────────────────────────┘        └──────────────────────────────────┘
        [ bar ]                                 [ bar ]
```

Not in scope (later, maybe): playing along on a MIDI keyboard or by tapping the keys
(wait-for-note), scrubbing by dragging the falling notes, a light theme.

## Rules

- **The sheet is untouched.** The keys are a new toggle in the bar (`view`: Sheet / Keys),
  kept in the URL as `?view=keys` like `names`, `hand` and `level`.
- **One clock.** The keys draw from the engine's `now()` (the same `pos` the sheet lights
  from), so speed, seeking, bar steps, the video leading (Sound: Original) and the levels
  all work without extra code.
- **The sheet keeps rendering on phones in keys mode.** Verovio renders and the MIDI comes
  from the sheet, and `render()` needs its width. So the scroller is hidden with
  `visibility: hidden` (absolutely placed), never with `display: none`. That would also break
  `getBBox()` for the note names.
- **Canvas, not DOM.** One `<canvas>` sized for the device pixel ratio and redrawn every
  frame while playing, and once after a seek, pause, render or resize.

## How

### Notes

From the MIDI that Verovio renders (`player.noteSequence` before `reshapeMidi` changes it),
so ties come out as one note. Each note gets its hand and sheet id by matching pitch and
onset (within 5 ms) against `tk.getMIDIValuesForElement(id)` for every id in `handOf`,
the same matching `reshapeMidi` uses. Times are converted to `pos` (`× speed`). The bars
show the written lengths, not the pedal-held ones, so a sustained chord doesn't hide the
notes after it.

With one hand on, the other hand's bars are drawn grey and don't light keys, like the
sheet fading that staff.

### Drawing: `lib/player/keys.ts`

`createKeys(canvas)` → `{ setSong(notes, measures), draw(pos, opts) }`.

- **Range:** the song's lowest to highest pitch plus one key each side, snapped to white
  keys, widened to at least two octaves so the keys stay a sane size.
- **Keyboard:** white keys with black keys on top. The keyboard's height comes from the
  white key's width, capped at a quarter of the canvas. Each C is labelled (C3, C4…).
- **Bars:** `y = keyboardTop − (start − pos) × pxPerSec`, with height = length ×
  `pxPerSec`. The fall area shows about 3 s of the sheet, so slower speeds fall slower.
  Right hand is red (`--accent`), left hand is blue. Rounded, with a faint line at every
  bar line of the music and at every C for orientation.
- **Lit keys:** a key whose note covers `pos` is filled with its hand's colour, plus a soft
  glow where the bar meets the key.
- **Note names:** with the names toggle on, each bar shows its name (C D E or Do Re Mi,
  spelled as on the sheet via `noteName`) at its bottom when it fits.

### Engine wiring: `lib/player/engine.ts`

- Build the notes in `render()` once the MIDI has loaded (inside `midiReady`, before the
  reshape), and on names/hand changes (those already re-render).
- Call `drawKeys(pos)` from `tick()`, `seek()`, `pause()`, `render()` and when the canvas
  resizes, and only when the view is on.
- New toggle `view` in `TOGGLES`, which sets `body.dataset.view` and the URL. Switching
  back to the sheet re-follows the current line.

### Markup and CSS

- `components/Player.tsx`: `<div class="keys-pane"><canvas id="keys"></div>` inside
  `.sheet-pane` after the scroller, and the `view` toggle button in `.side`.
- `components/Icons.tsx`: `i-sheet` (staff) and `i-keys` (keyboard) for the toggle.
- `app/globals.css`: `.keys-pane` hidden unless `body[data-view="keys"]`. Wide: fixed
  height (`--keys-h: 46dvh`), with "Back to current" above it. Phone: it fills the pane,
  with the scroller hidden as above. Its bottom padding keeps the keyboard above the
  floating bar. On phones the bar's icons can shrink a little (`flex: 1`, max 40px) so the
  extra button fits on a 375px screen.

## Checks

1. `pnpm build` passes (typecheck and static export).
2. In a browser (needs the user's OK first, see the global rule): phone width and desktop
   width, both views, play, pause, seek on the ring, bar steps, 0.5×, one hand, an easy
   song switching levels, and Sound: Original (the video leading). Bars land on the keys
   exactly as the note sounds and the sheet lights it.

## What was built
