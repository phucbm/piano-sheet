// The service worker: precaches the app shell (pages, JS, CSS, fonts, icons) and caches each
// song's files and the CDN scripts the first time they're used, so the installed app and every
// song already played work offline. Built after `next build` by scripts/build-sw.mjs.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, NetworkFirst, RangeRequestsPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const BASE = process.env.NEXT_PUBLIC_BASE || "";
const ok = (...statuses: number[]) => new CacheableResponsePlugin({ statuses });
// On a cache miss, ask the network for the whole file instead of the range <video> wanted.
const wholeFile = { requestWillFetch: async ({ request }: { request: Request }) => new Request(request.url, { credentials: request.credentials }) };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Next asks for a page's .txt with ?_rsc=<hash> when moving between songs, and for the icons with ?icon.<hash>.svg.
  precacheOptions: { ignoreURLParametersMatching: [/^_rsc$/, /^(apple-)?icon\./, /^utm_/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    { matcher: /\/_next\/static\//, handler: new CacheFirst({ cacheName: "next-static" }) },
    // Video and recordings: <video> asks for byte ranges (206), which can't be stored, so the
    // whole file is fetched and cached on the first request and ranges are cut from that copy.
    {
      matcher: ({ url }) => url.pathname.startsWith(`${BASE}/media/`) && /\.(mp4|m4a|mp3|wav|webm|mov)$/i.test(url.pathname),
      handler: new CacheFirst({ cacheName: "song-media", plugins: [wholeFile, ok(200), new RangeRequestsPlugin()] }),
    },
    // Sheet, timing and picture: can be re-made by the pipeline, so refresh in the background.
    {
      matcher: ({ url }) => url.pathname.startsWith(`${BASE}/media/`),
      handler: new StaleWhileRevalidate({ cacheName: "songs", plugins: [ok(200)] }),
    },
    // Verovio is "latest": use the cached copy, refresh it in the background.
    {
      matcher: /^https:\/\/www\.verovio\.org\//,
      handler: new StaleWhileRevalidate({ cacheName: "verovio", plugins: [ok(0, 200)] }),
    },
    // html-midi-player and its soundfont: pinned versions, never change.
    {
      matcher: /^https:\/\/(cdn\.jsdelivr\.net|storage\.googleapis\.com\/magentadata)\//,
      handler: new CacheFirst({ cacheName: "midi-player", plugins: [ok(0, 200)] }),
    },
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkFirst({ cacheName: "pages" }) },
  ],
  fallbacks: {
    entries: [{ url: `${BASE}/`, matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
