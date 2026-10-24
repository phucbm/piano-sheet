// Copies what the songs in songs.json use from output/ and input/ into public/media/
// (run before `next dev` and `next build`). Only those files, so the Pages artifact stays small.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const songs = JSON.parse(readFileSync("songs.json", "utf8"));
const dest = "public/media";
const files = new Set(), missing = [];
const need = (path, optional) => existsSync(path) ? files.add(path) : optional || missing.push(path);

for (const s of songs) {
  for (const file of s.levels ? s.levels.map(l => `${s.name}.${l}`) : [s.name]) {
    need(`output/${file}.musicxml`);
    need(`output/${file}.timing.json`, !s.audio);  // only a recording needs the timing
  }
  if (s.video || s.audio) need(s.video ? `input/${s.video}` : `output/${s.audio}`);  // the recording alone when there's no video
  need(`output/${(s.audio || s.name).replace(/\.[^.]+$/, "")}.jpg`, true);  // preview picture (scripts/thumb.sh)
}
if (missing.length) {
  console.error(`copy-media: files listed in songs.json are missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(f, `${dest}/${f.split("/").pop()}`);
console.log(`copy-media: ${files.size} files → ${dest}/`);
