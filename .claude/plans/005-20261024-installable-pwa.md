# 005: Make the player an installable app (PWA) that works offline

Written: 2026-10-24. Status: Done 2026-10-24
Related: plan 004 (Next.js static export, `basePath` `/piano-sheet`, `copy-media.mjs`).
References: `hieu-chu-han` (Next 16 + `@serwist/next`), `phucbm/clyrics` (Vite + `@serwist/vite`).

## Goal

1. Chrome/Edge/Android show "Install app", and iOS "Add to Home Screen" opens it as a
   standalone app with its own icon, name and dark status bar. Today none of this works:
   there's no manifest, no icons and no service worker.
2. Once installed, the app opens offline, and every song you've already played plays
   offline too: sheet, timing, picture and video or recording.

Not in scope: install/visit counters (hieu-chu-han's `PWATracker` + counterapi), a custom
"Install" button, push notifications, a redesign.

## Rules

- **Static only, as in plan 004.** The manifest and service worker are files in `out/`. No
  `headers` in `next.config`, no server.
- **Everything goes under `basePath`.** In production the site is at `/piano-sheet/`, so
  `start_url`, `scope`, icon paths, `sw.js` and its scope all use `NEXT_PUBLIC_BASE`. This is
  the one thing the two reference projects don't need (both are at `/`), so check it.
- **No service worker in dev**, same as hieu-chu-han. It only gets registered in production
  builds, so `next dev` never serves stale files.
- **Song files don't go into the precache.** The app shell gets precached. Songs are cached
  the first time they're played, so installing doesn't download every video (`public/media`
  is 4.4 MB now and grows with every song).

## How

### 1. Icons

`public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (artwork inside the
centre 80%), `apple-touch-icon.png` (180), plus `app/icon.png` for the tab favicon (same
pattern as hieu-chu-han). Background `#121212` to match `themeColor`.
**Open question:** is there artwork? If not, use a simple placeholder (a note or keys on
`#121212`) and swap it later.

### 2. Manifest: `app/manifest.ts`

A Next metadata route. It's static, so it works with `output: "export"` and is written to
`out/manifest.webmanifest`. Next links it in `<head>` by itself, so there's no
`manifest:` entry in `metadata`.

```ts
const base = process.env.NEXT_PUBLIC_BASE ?? "";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piano sheet player", short_name: "Piano sheet",
    start_url: `${base}/`, scope: `${base}/`, id: `${base}/`,
    display: "standalone", background_color: "#121212", theme_color: "#121212",
    icons: [192, 512 icons with `${base}/icons/...`, the maskable one with purpose "maskable"],
  };
}
```

Orientation stays unset (not `portrait` as in hieu-chu-han), because the sheet reads well
in landscape.

### 3. iOS bits in `app/layout.tsx`

Add `applicationName`, `appleWebApp: { capable: true, title: "Piano sheet",
statusBarStyle: "black-translucent" }` (`viewportFit: "cover"` is already set) and
`icons.apple`. Check the floating controller stays clear of the notch and home bar
(`env(safe-area-inset-*)`) once the app runs full screen.

### 4. Service worker: `app/sw.ts` with Serwist

Use the same library as both references (`serwist`). One difference: the Next 16 build
uses Turbopack by default, and `@serwist/next` is a webpack plugin. Rather than depend on
that, and since this site is a plain static export, build the SW **after** `next build`,
straight against `out/`, with `@serwist/build`'s `injectManifest` and esbuild, in a small
`scripts/build-sw.mjs`:

- `swSrc: "app/sw.ts"`, `swDest: "out/sw.js"`, `globDirectory: "out"`.
- `globPatterns`: `**/*.{html,js,css,woff2,png,svg,webmanifest}`, ignoring `media/**`.
- `modifyURLPrefix: { "": base + "/" }` so precache URLs carry `/piano-sheet/`.
- `package.json`: `"postbuild": "node scripts/build-sw.mjs"`.

Inside `sw.ts` (based on clyrics' `sw.ts` and hieu-chu-han's runtime rules):

| Match | Handler | Cache |
| --- | --- | --- |
| `/_next/static/` | CacheFirst (hashed names) | `next-static` |
| `/media/*.musicxml`, `*.timing.json`, `*.jpg` | StaleWhileRevalidate | `songs` |
| `/media/*.{mp4,MP4,m4a,mp3,wav}` | CacheFirst + `RangeRequestsPlugin` + `CacheableResponsePlugin({statuses:[200]})` | `song-media` |
| navigations | NetworkFirst, fallback to the precached `${base}/` | `pages` |

`skipWaiting`, `clientsClaim`, `navigationPreload: true` as in both references.

Video needs extra care. `<video>` sends `Range` requests and gets 206 back, which can't
be cached. The video rule fetches the whole file once (no `Range` header) on the first
cache miss and answers range requests from that copy. Test with a song that has a video
(`vien-da-nho.MP4`) and one that only has a recording.

Fonts: `next/font` self-hosts Manrope under `/_next/static/media`, so the
`next-static` rule covers them. There's no Google Fonts rule to copy.

### 5. Register it: `components/RegisterSW.tsx`

A client component mounted in `layout.tsx`:
`if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
navigator.serviceWorker.register(\`${base}/sw.js\`, { scope: \`${base}/\` })`.
It shows nothing. Updates are picked up silently on the next launch (`skipWaiting`).

### 6. Ignore and deploy

`.gitignore` already covers `out/`. `pages.yml` uploads `out/`, so it ships `sw.js` and
`manifest.webmanifest` without changes. Confirm `pnpm build` in the workflow runs
`postbuild` (pnpm runs pre/post scripts by default).

## Checks

1. `pnpm build`: `out/sw.js` and `out/manifest.webmanifest` exist. The precache list has
   `/piano-sheet/...` URLs and no `media/` files.
2. Serve `out/` under `/piano-sheet/` (e.g. a copy in `/tmp/site/piano-sheet/` and
   `npx serve /tmp/site`). In Chrome DevTools, Application → Manifest shows no errors and
   is installable, and Service workers shows one active worker with scope `/piano-sheet/`.
   Lighthouse PWA/installability passes.
3. Play a song, go offline in DevTools, reload: the home page and that song's page open,
   the sheet shows and the video plays, including seeking. A song that was never played
   shows the sheet only if it's cached; otherwise it fails cleanly, without a blank app.
4. After deploying: install on Android Chrome and on iPhone (Add to Home Screen). It
   opens standalone, the icon and name are right, and the controller isn't under the
   notch or home bar.
5. `next dev` registers no service worker.

Browser checks need the user's OK first (global rule). Without it, stop at check 1 and
say plainly that the UI wasn't tested in a browser.

## Open questions

- Icon artwork, or a placeholder for now?
- App name on the home screen: "Piano sheet" OK?
- Cache songs only after they're played (planned), or add a "save for offline" option
  per song later?

## What was built (2026-10-24)

Same as above, except:

- **Icon:** a placeholder (keys on `#121212`, one red key) drawn in `app/icon.svg`, which is
  also the favicon. `public/icons/icon-192.png` and `icon-512.png` are made from it with
  `magick -background none -density 300 app/icon.svg -resize 512x512 …`. The keys sit inside the
  centre 80%, so `icon-512.png` is also the maskable icon. The Apple icon is `app/apple-icon.png`
  (180), not `metadata.icons`: setting `icons` in metadata hid the file-based favicon and
  Next didn't put `/piano-sheet` in front of it.
- **The SW source is `sw/sw.ts`,** not `app/sw.ts`, so the app's DOM tsconfig doesn't
  typecheck it. Built by `scripts/build-sw.mjs` (esbuild, then `@serwist/build`
  `injectManifest`), run as `postbuild`. Precache: 48 files, about 890 KB. `index.html` becomes
  the folder URL, and `?_rsc=` and the icons' `?icon.<hash>` are ignored when looking up.
- **CDN scripts are cached too.** Without them, offline would mean no sheet: Verovio
  (StaleWhileRevalidate, it's `latest`), the html-midi-player bundle on jsDelivr and the
  Magenta soundfont on `storage.googleapis.com` (CacheFirst, pinned versions).
- **Video:** on a cache miss, the request goes out without its `Range` header, so the
  whole file comes back as a 200 and gets cached. Later ranges are cut from that copy (206).
- **A song that was never opened, offline:** `lib/player/engine.ts` shows "Can't load this
  sheet. You're offline and it hasn't been opened before." It used to leave a blank sheet and
  an uncaught `Failed to fetch`.

Checked with headless Chrome (Playwright, the system Chrome, `out/` served under
`/piano-sheet/`). The SW controls the page, the manifest loads, and after one online visit
to `vien-da-nho` the page goes offline and reloads with the sheet rendered (277 notes),
Verovio and the midi player loaded, and the MP4 answering a range request with 206. The
home page opens offline, and the never-opened song shows the message with no page errors.
**Not yet tested:** the Chrome install prompt and Lighthouse, and installing on a real Android
phone and iPhone (standalone launch, safe areas). Do those after the Pages deploy.
