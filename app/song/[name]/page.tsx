import type { Metadata } from "next";
import { SONGS } from "@/lib/songs";
import { songMetadata } from "@/lib/meta";

// One static page per song, for its link preview. The player in the layout plays it.
export const dynamicParams = false;

export function generateStaticParams() {
  return SONGS.map(s => ({ name: s.name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const song = SONGS.find(s => s.name === decodeURIComponent(name))!;
  return songMetadata(song, `/song/${song.name}/`);
}

export default function SongPage() {
  return null;
}
