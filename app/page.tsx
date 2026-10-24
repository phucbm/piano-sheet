import type { Metadata } from "next";
import { SONGS } from "@/lib/songs";
import { songMetadata } from "@/lib/meta";

// Home: the first song. Old links (?song=<name>&names=…) are read by the player, which
// moves the address to /song/<name>/.
export const metadata: Metadata = songMetadata(SONGS[0], "/");

export default function Home() {
  return null;
}
