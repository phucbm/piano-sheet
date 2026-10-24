// Builds out/sw.js after `next build` (postbuild): bundles sw/sw.ts with esbuild, then injects
// the precache list of out/ (the app shell, not public/media/, songs are cached when played).
import { build } from "esbuild";
import { injectManifest } from "@serwist/build";

const base = process.env.NODE_ENV === "development" ? "" : "/piano-sheet";  // same as next.config.ts
const tmp = ".next/sw.js";

await build({
  entryPoints: ["sw/sw.ts"], outfile: tmp, bundle: true, minify: true, format: "iife",
  define: { "process.env.NEXT_PUBLIC_BASE": JSON.stringify(base), "process.env.NODE_ENV": '"production"' },
});
const { count, size, warnings } = await injectManifest({
  swSrc: tmp,
  swDest: "out/sw.js",
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,css,woff2,png,svg,ico,webmanifest,txt}"],
  globIgnores: ["media/**", "sw.js"],
  modifyURLPrefix: { "": `${base}/` },
  // song/x/index.html → song/x/, the URL the pages are opened at (trailingSlash in next.config).
  manifestTransforms: [async entries => ({ manifest: entries.map(e => ({ ...e, url: e.url.replace(/index\.html$/, "") })) })],
  // Next's html pages have no hash in the name; revisions come from the file contents.
  dontCacheBustURLsMatching: /^\/?.*\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
});
warnings.forEach(w => console.warn(`build-sw: ${w}`));
console.log(`build-sw: ${count} files precached (${(size / 1024).toFixed(0)} KB) → out/sw.js`);
