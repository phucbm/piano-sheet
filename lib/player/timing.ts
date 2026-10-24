// Sheet time <-> recording time. Positions ("pos") are seconds of the sheet at 100% speed.
// timing.json has the recording time of every sixteenth on the sheet (from to_sheet.py's
// beat grid). Without it, stretch the sheet over the recording: ratio = recording / sheet length.

export type Timing = { bpm: number; sixteenths: number[] };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function toRec(t: Timing | null, pos: number, ratio: number) {
  if (!t) return pos * ratio;
  const s = t.sixteenths, x = pos * t.bpm / 15;
  const i = clamp(Math.floor(x), 0, s.length - 2);
  return s[i] + (s[i + 1] - s[i]) * (x - i);
}

export function toSheet(t: Timing | null, rec: number, ratio: number) {
  if (!t) return rec / (ratio || 1);
  const s = t.sixteenths;
  let lo = 0, hi = s.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= rec) lo = m; else hi = m - 1; }
  return (lo + (rec - s[lo]) / ((s[lo + 1] - s[lo]) || 1)) * 15 / t.bpm;
}

// Recording seconds per sheet second around pos.
export function slope(t: Timing | null, pos: number, ratio: number) {
  if (!t) return ratio;
  const s = t.sixteenths, i = clamp(Math.floor(pos * t.bpm / 15), 0, s.length - 2);
  return (s[i + 1] - s[i]) * t.bpm / 15;
}
