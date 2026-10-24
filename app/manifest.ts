import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_BASE || "";

// Written to out/manifest.webmanifest at build; Next links it in <head>.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piano sheet player",
    short_name: "Piano sheet",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      // The keys sit inside the centre 80%, so the same picture works as a maskable icon.
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
