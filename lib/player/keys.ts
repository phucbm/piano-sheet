// The falling notes view: the song's notes fall as bars onto a piano keyboard and each key
// lights up while its note sounds. Drawn on one canvas from the player's pos (seconds of the
// sheet at 100% speed), so it follows every way the player moves.

export type KeyNote = { pitch: number; start: number; end: number; hand: string; name: string };
export type Keys = {
  setSong: (notes: KeyNote[], bars: number[]) => void;
  resize: () => void;
  draw: (pos: number, hand: string) => void;
};

const WINDOW = 3;  // seconds of the sheet shown falling
const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (p: number) => BLACK.has(p % 12);
const COLORS: Record<string, [string, string]> = {  // per hand: on a white key, on a black key
  right: ["#e8442e", "#b8321f"],
  left: ["#3d8fe0", "#2a6bb0"],
};
const OTHER = "rgba(255, 255, 255, .16)";  // the hand that's switched off

export function createKeys(canvas: HTMLCanvasElement): Keys {
  const ctx = canvas.getContext("2d")!;
  let notes: KeyNote[] = [], bars: number[] = [];
  let lo = 48, hi = 72, width = 0, height = 0;

  // The song's lowest to highest key plus one each side, on white keys, at least two octaves.
  function setRange() {
    const pitches = notes.map(n => n.pitch);
    lo = pitches.length ? Math.min(...pitches) - 1 : 48;
    hi = pitches.length ? Math.max(...pitches) + 1 : 72;
    const whites = () => { let k = 0; for (let p = lo; p <= hi; p++) if (!isBlack(p)) k++; return k; };
    const fix = () => { while (isBlack(lo)) lo--; while (isBlack(hi)) hi++; };
    fix();
    for (let i = 0; whites() < 15 && (lo > 21 || hi < 108); i++) {
      if ((i % 2 || hi >= 108) && lo > 21) lo--; else hi++;
      fix();
    }
  }

  function setSong(next: KeyNote[], barPos: number[]) {
    notes = next.sort((a, b) => a.start - b.start);
    bars = barPos;
    setRange();
  }

  function resize() {
    const dpr = devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(pos: number, hand: string) {
    if (!width || !height) return;
    // Keys: x and width per pitch. White keys side by side, black ones over the gaps.
    const whites: number[] = [];
    for (let p = lo; p <= hi; p++) if (!isBlack(p)) whites.push(p);
    const ww = width / whites.length, bw = ww * 0.6;
    const kh = Math.min(ww * 5.5, height / 4), bh = kh * 0.62, top = height - kh;
    const keyX = (p: number) => isBlack(p) ? whites.indexOf(p - 1) * ww + ww - bw / 2 : whites.indexOf(p) * ww;
    const keyW = (p: number) => isBlack(p) ? bw : ww;
    const pps = top / WINDOW;
    const yOf = (t: number) => top - (t - pos) * pps;
    const plays = (n: KeyNote) => !hand || n.hand === hand;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, width, top);

    // Guides: a line at every C, and one at every bar line of the music.
    ctx.fillStyle = "rgba(255, 255, 255, .05)";
    whites.forEach((p, i) => p % 12 === 0 && i && ctx.fillRect(Math.round(i * ww), 0, 1, top));
    ctx.fillStyle = "rgba(255, 255, 255, .09)";
    bars.forEach(b => { const y = yOf(b); if (y > 0 && y < top) ctx.fillRect(0, Math.round(y), width, 1); });

    // The bars, written lengths, clipped to the fall area.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, top);
    ctx.clip();
    const lit = new Map<number, KeyNote>();
    const fontSize = Math.max(8, Math.min(13, ww * 0.45));
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const n of notes) {
      if (n.start > pos + WINDOW) break;
      if (n.end < pos || n.pitch < lo || n.pitch > hi) continue;
      if (n.start <= pos + 0.005 && plays(n)) lit.set(n.pitch, n);
      const black = isBlack(n.pitch);
      const inset = black ? 0.5 : 1.5;
      const x = keyX(n.pitch) + inset, w = keyW(n.pitch) - inset * 2;
      const y0 = yOf(n.end), y1 = yOf(n.start);
      ctx.fillStyle = plays(n) ? COLORS[n.hand]?.[+black] || COLORS.right[+black] : OTHER;
      ctx.beginPath();
      ctx.roundRect(x, y0, w, Math.max(y1 - y0 - 1, 2), Math.min(4, w / 3));
      ctx.fill();
      if (n.name && y1 - y0 > fontSize + 6 && ctx.measureText(n.name).width < w + 2) {
        ctx.fillStyle = plays(n) ? "#fff" : "rgba(255, 255, 255, .5)";
        ctx.fillText(n.name, x + w / 2, Math.min(y1, top) - 5);
      }
    }
    ctx.restore();

    // A soft glow where a sounding bar meets its key.
    lit.forEach((n, p) => {
      const x = keyX(p), w = keyW(p), color = COLORS[n.hand]?.[0] || COLORS.right[0];
      const g = ctx.createLinearGradient(0, top - 24, 0, top);
      g.addColorStop(0, "transparent");
      g.addColorStop(1, color + "99");
      ctx.fillStyle = g;
      ctx.fillRect(x - w * 0.4, top - 24, w * 1.8, 24);
    });

    // The keyboard: white keys, a C label on each C, then the black keys on top.
    ctx.fillStyle = "#3a1a14";
    ctx.fillRect(0, top - 2, width, 2);
    ctx.font = `600 ${Math.max(8, Math.min(11, ww * 0.4))}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    whites.forEach((p, i) => {
      const n = lit.get(p);
      ctx.fillStyle = n ? COLORS[n.hand]?.[0] || COLORS.right[0] : "#f2f0ec";
      ctx.beginPath();
      ctx.roundRect(i * ww + 0.5, top, ww - 1, kh, [0, 0, 3, 3]);
      ctx.fill();
      if (p % 12 === 0 && ww > 12) {
        ctx.fillStyle = n ? "#fff" : "#8a8a8a";
        ctx.fillText(`C${p / 12 - 1}`, i * ww + ww / 2, height - 4);
      }
    });
    for (let p = lo; p <= hi; p++) {
      if (!isBlack(p)) continue;
      const n = lit.get(p);
      ctx.fillStyle = n ? COLORS[n.hand]?.[1] || COLORS.right[1] : "#161616";
      ctx.beginPath();
      ctx.roundRect(keyX(p), top, bw, bh, [0, 0, 2, 2]);
      ctx.fill();
    }
  }

  return { setSong, resize, draw };
}
