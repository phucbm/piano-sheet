import type { Metadata } from "next";
import { type Song, SITE, baseOf, versionOf } from "./songs";
import { existsSync } from "node:fs";

// Title, description and preview picture for a song's page, so a shared link shows the song.
// The picture is output/<recording>.jpg (scripts/thumb.sh), else the site-wide og.png.
export function songMetadata(song: Song, path: string): Metadata {
  const title = `${song.name} · Piano sheet`;
  const version = versionOf(song);
  const description = `Two-hand piano sheet for ${song.name}${version === "original" ? "" : ` (${version})`}, with the original video in step.`;
  const pic = existsSync(`output/${baseOf(song)}.jpg`) ? `${SITE}/media/${baseOf(song)}.jpg` : `${SITE}/og.png`;
  const images = [{ url: pic, width: 1200, height: 630, alt: song.name }];
  return {
    title, description,
    alternates: { canonical: `${SITE}${path}` },
    openGraph: { title, description, url: `${SITE}${path}`, siteName: "Piano sheet", type: "website", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
