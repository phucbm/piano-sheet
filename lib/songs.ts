import list from "@/songs.json";

// One entry per sheet. Versions of a song (original, easy-in-C, …) share the recording.
export type Song = {
  name: string;   // output/<name>.musicxml and .timing.json
  audio: string;  // the recording in output/, full file name
  video?: string; // the original video in input/, if there is one
  source?: string;
  // Easy versions: left-hand levels, easiest first, each its own sheet (<name>.<level>.musicxml
  // and .timing.json, written by to_sheet.py --easy), and the one a link opens with.
  levels?: string[];
  level?: string;
};

export const SONGS: Song[] = list as Song[];
export const SITE = "https://phucbm.github.io/piano-sheet";

// The recording's name without the extension: the song the versions belong to.
export const baseOf = (s: Song) => s.audio.replace(/\.[^.]+$/, "");
export const versionOf = (s: Song) => s.name === baseOf(s) ? "original" : s.name.replace(baseOf(s) + "-", "");
