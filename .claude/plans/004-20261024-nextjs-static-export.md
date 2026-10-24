# 004: Move the player to Next.js, exported as a static site for GitHub Pages

Written: 2026-10-24. Status: Draft
Related: plan 002 (the player), plan 003 (songs from a link, `songs.json`, the merge flow)

## Goal

The player keeps working exactly as today, on https://phucbm.github.io/piano-sheet/, but is built
with Next.js (`output: 'export'`) so that:

1. Every song has its own page, `/piano-sheet/song/<name>/`, with its own title, description and
   preview picture, so a shared link shows the song (Discord, Messenger, Zalo, X).
2. The song list comes from `songs.json` at build time, not a hardcoded array.
3. The code is split into TypeScript components and modules the UI can grow on.

Not in scope: a server, API routes, auth, changing how the sheet plays or highlights, a redesign.
The Python pipeline (`scripts/`, `to_sheet.py`) doesn't change.

## Rules

- **Same behaviour first.** Port `player.js` with its logic line for line (timing, `toRec`/`toSheet`,
  highlight, follow, video sync). Don't rewrite it into React state. Changes to how it behaves
  are separate work after this plan.
- **Static only.** Nothing that needs a server: no `headers`/`rewrites`/`redirects` in
  `next.config`, no route handlers that run per request, no `next/image` optimisation, no
  middleware. `next build` must finish with `out/` and no warnings about dynamic routes.
- **Old links keep working.** `?song=<name>` and `?names=` on the home page still open the song.
- **Names come from the file** (see plan 003): page titles use the slug, never a guessed title.
- **The pipeline's paths stay.** Scripts keep writing to `output/` and `input/`. The build copies
  what the site needs; nothing in `scripts/` learns about Next.
- Every sheet still passes `scripts/check_highlight.py`. If the highlight margin or speeds move
  to a new file, update the "same as player.js" comments in that script.

## Layout

```
app/
  layout.tsx            # <html>, Manrope (next/font), globals.css, <Player> mounted once
  page.tsx              # home: first song; reads ?song= on the client and goes to its page
  song/[name]/page.tsx  # generateStaticParams + generateMetadata from songs.json; renders nothing visible
  globals.css           # player.css as it is
components/
  Player.tsx            # the markup from index.html as JSX ("use client"), starts the engine
  Icons.tsx             # the <svg><symbol> sprite
  SubmitBox.tsx         # plan 003 step 7, if that step lands first or after
lib/
  songs.ts              # reads songs.json (build time) + types
  player/engine.ts      # player.js ported: init(root, songs) / load(song) / destroy()
  player/timing.ts      # toRec, toSheet, slope (pure, easy to check)
scripts/copy-media.mjs  # output/ + input/ → public/media/ (predev, prebuild)
next.config.ts
```

The player lives in the root layout, so moving between `/song/a/` and `/song/a-easy-in-C/` with
the version buttons (client-side `router.push`) keeps the same `<video>` element and doesn't
reload the recording, the same as `load()`'s `sameMedia` check today. The engine listens to
`usePathname()` and calls `load()` when the song changes.

## Steps

### 1. `songs.json` (plan 003 step 3)

If plan 003 hasn't done it yet, do that step here, in its format:
`[{ "name": "vien-da-nho", "audio": "vien-da-nho.wav", "video": "vien-da-nho.MP4", "source": "" }, …]`.
Plan 003's `add.sh` appends to it. Check: both current songs listed, sorted by name.

### 2. Next.js app beside the Python code

- Branch `nextjs`. `pnpm add next react react-dom`, `pnpm add -D typescript @types/react @types/node`.
  Drop the direct `vite` dev dependency once `next dev` replaces it.
- `next.config.ts`:
  ```ts
  const base = process.env.NODE_ENV === "production" ? "/piano-sheet" : "";
  export default {
    output: "export",
    basePath: base,
    trailingSlash: true,          // song/x/index.html, which Pages serves without .html
    images: { unoptimized: true },
    env: { NEXT_PUBLIC_BASE: base },
  };
  ```
- `tsconfig.json` limited to `app/`, `components/`, `lib/` so it doesn't look into `.venv/`.
- `.gitignore`: `.next/`, `out/`, `public/media/`, `next-env.d.ts`.
- Scripts: `"dev": "next dev -p 8000"`, `"build": "next build"`, `"predev"`/`"prebuild"`:
  `node scripts/copy-media.mjs`.

### 3. Media copy

- `scripts/copy-media.mjs`: for each song in `songs.json`, copy `output/<name>.musicxml`,
  `output/<name>.timing.json`, `output/<audio>` and `input/<video>` into `public/media/`. Only
  files that songs use (not `.raw.mid`, `.wav` of songs that have an `.m4a`, etc.), so the
  Pages artifact stays small. Fail with a clear message if a listed file is missing.
- The engine builds URLs as `${NEXT_PUBLIC_BASE}/media/<file>`.
- Check: `ls public/media` has exactly what the two songs need.

### 4. Port the player

- `index.html` body → `components/Player.tsx` (same ids and classes, so `globals.css` = `player.css`
  untouched). `class` → `className`, inline `style` objects, sprite → `Icons.tsx`.
- Verovio and html-midi-player stay on the same CDN URLs, loaded with `next/script`
  (`strategy="afterInteractive"`). The engine waits for `window.verovio` and `customElements.get("midi-player")`
  before `new verovio.toolkit()`, replacing the `DOMContentLoaded` + `onRuntimeInitialized` start.
- `player.js` → `lib/player/engine.ts`: the module-level `const`s become fields set in `init(root, songs)`,
  every `addEventListener` and `matchMedia` listener is removed in `destroy()` (React strict mode
  mounts twice in dev). `SONGS` comes from `songs.json`. Types stay loose (`any` for Verovio
  and the midi player) at first; tighten after it works.
- `updateUrl()` → `router.replace` to `/song/<name>/` keeping `?names=`; version buttons and the
  library use `router.push` instead of calling `load()` directly.
- Manrope through `next/font/google` (downloaded at build, no Google Fonts request at runtime).
- Check against the live site, side by side, on phone and desktop widths: render, play at 50/75/100%,
  red notes follow, tap a note to jump, ←/→/Space, Sound sheet/original/both, video stays in step,
  library, versions, study mode names, back-to-current, thumbnail from the video.

### 5. Song pages and preview cards

- `app/song/[name]/page.tsx`: `generateStaticParams()` → every name in `songs.json`;
  `dynamicParams = false`.
- `generateMetadata()`: title `<name> · Piano sheet`, description
  "Two-hand piano sheet for <name>, with the original video in step." (`original`/`easy-in-C` in
  the text from the version), `openGraph` + `twitter` with the picture below, `metadataBase`
  `https://phucbm.github.io/piano-sheet/`.
- Picture: a frame from the video at the first note, made by the pipeline:
  `scripts/thumb.sh <name>` (ffmpeg, 1200×630, `output/<audio>.jpg`), also called from plan 003's
  `add.sh`. Songs without a picture fall back to one site-wide `public/og.png`.
- Home page: same metadata as the first song's page, plus the `?song=` redirect on the client.
- Check: `out/song/vien-da-nho/index.html` and `out/song/vien-da-nho-easy-in-C/index.html` exist,
  each with its own `<title>` and `og:image`; paste a link in Discord after deploy and look.

### 6. Deploy with GitHub Actions

- `.github/workflows/pages.yml`: on push to `main` (and `workflow_dispatch`): checkout,
  pnpm + Node 22 with cache, `pnpm install --frozen-lockfile`, `pnpm build`,
  `actions/upload-pages-artifact` with `out/`, `actions/deploy-pages`.
  `permissions: pages: write, id-token: write`, `concurrency: pages`.
- Repo setting (with the user's go): Pages source "Deploy from a branch" → "GitHub Actions"
  (`gh api -X PUT repos/phucbm/piano-sheet/pages -f build_type=workflow`). The switch drops the
  live site until the first Actions deploy finishes, so do it right after the workflow is on
  `main` and run it by hand.
- Remove `index.html`, `player.css`, `player.js` from the root in the same PR, so the branch
  deploy and the Actions deploy can't both be live with different code.
- Check: `https://phucbm.github.io/piano-sheet/`, `…/?song=vien-da-nho-easy-in-C` and
  `…/song/vien-da-nho-easy-in-C/` all play; a hard refresh on a song page works (no 404).

### 7. Update plan 003 and the README

- Plan 003: the rule "no build step" becomes "built by `pages.yml`"; `song-merged.yml` links to
  `/song/<name>/`; the convert workflow runs `pnpm build` after `add.sh` so a PR that breaks the
  build fails before review; `SubmitBox` replaces the `index.html` form in step 7.
- README: Use (`pnpm dev` now runs Next), adding a song (`songs.json` instead of `SONGS`),
  Deploy (GitHub Actions, ~1–2 min after a push), How step 4 (Next.js static export).

## Open

- Verovio and html-midi-player from npm instead of the CDN (version pinned in the lockfile,
  works offline in dev). Verovio is ~7 MB of WASM, so keep the CDN unless there's a reason; a later step.
- Pages artifacts are capped at 1 GB and each song adds a video. When plan 003 brings many songs,
  move videos out of the repo (or keep only `.m4a` + a picture) before that becomes a problem.
- Per-song preview pictures drawn by Next (`opengraph-image.tsx` with the title on it) instead of
  a video frame, if a plain frame doesn't look good in Discord.
