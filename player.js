// Add new songs here: output/<name>.musicxml, its output/<name>.timing.json (keeps the video
// in step with the sheet), the recording output/<audio>.wav, and optionally the video.
const SONGS = [
  { name: "vien-da-nho", audio: "vien-da-nho", video: "input/vien-da-nho.MP4" },
  { name: "vien-da-nho-easy-in-C", audio: "vien-da-nho", video: "input/vien-da-nho.MP4" },
];

const $ = id => document.getElementById(id);
const player = $("player"), video = $("video"), scoreEl = $("score"), scroller = $("scroller");
const seekEl = $("seek"), volumeEl = $("volume");
const body = document.body;
const params = new URLSearchParams(location.search);

// Positions ("pos") are seconds of the sheet at 100% speed. The sheet's MIDI, rendered at
// the chosen speed, runs pos / speed; the recording runs toRec(pos).
const state = {
  song: null, xml: "", timing: null, duration: 0,
  speed: 1, names: params.get("names") || "", source: "sheet", volume: 0.8, muted: false,
  playing: false, pos: 0, follow: true,
};
let tk, lastIds = [], measures = [], currentSystem = null, raf = 0;
let anchor = { pos: 0, at: 0 };  // while the sheet plays: pos at a moment (performance.now())
let midiReady = Promise.resolve();

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const versionOf = s => s.name === s.audio ? "original" : s.name.replace(s.audio + "-", "");

// ---------- Sheet time <-> recording time ----------

// timing.json has the recording time of every sixteenth on the sheet (from to_sheet.py's
// beat grid). Without it, stretch the sheet over the recording.
function toRec(pos) {
  const t = state.timing;
  if (!t) return pos * ((video.duration || state.duration) / (state.duration || 1));
  const s = t.sixteenths, x = pos * t.bpm / 15;
  const i = clamp(Math.floor(x), 0, s.length - 2);
  return s[i] + (s[i + 1] - s[i]) * (x - i);
}

function toSheet(rec) {
  const t = state.timing;
  if (!t) return rec * ((state.duration || 1) / (video.duration || state.duration || 1));
  const s = t.sixteenths;
  let lo = 0, hi = s.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= rec) lo = m; else hi = m - 1; }
  return (lo + (rec - s[lo]) / ((s[lo + 1] - s[lo]) || 1)) * 15 / t.bpm;
}

// Recording seconds per sheet second around pos.
function slope(pos) {
  const t = state.timing;
  if (!t) return (video.duration || state.duration) / (state.duration || 1);
  const s = t.sixteenths, i = clamp(Math.floor(pos * t.bpm / 15), 0, s.length - 2);
  return (s[i + 1] - s[i]) * t.bpm / 15;
}

// ---------- Rendering ----------

function render() {
  const width = scoreEl.clientWidth;
  if (!tk || !state.xml || !width) return;
  tk.setOptions({
    pageWidth: Math.min(width, 1200) * 100 / 45,
    scale: 45, adjustPageHeight: true, breaks: "auto",
    midiTempoAdjustment: state.speed,
  });
  tk.loadData(state.xml);
  let svg = "";
  for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  scoreEl.innerHTML = svg;
  midiReady = new Promise(r => player.addEventListener("load", r, { once: true }));
  player.src = "data:audio/midi;base64," + tk.renderToMIDI();
  if (state.names) addNoteNames(state.names);  // needs the MIDI for the pitches
  const map = tk.renderToTimemap({ includeMeasures: true });
  measures = map.filter(e => e.measureOn).map(e => ({ pos: e.tstamp * state.speed / 1000, id: e.measureOn }));
  state.duration = (map.at(-1)?.tstamp || 0) * state.speed / 1000;
  renderedWidth = width;
  lastIds = []; currentSystem = null;
  updateLine(state.pos, true);
  updateBar();
}

let renderedWidth = 0, resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (scoreEl.clientWidth && Math.abs(scoreEl.clientWidth - renderedWidth) > 4) rerender();
  }, 200);
}).observe(scoreEl);

// Re-render (new width, speed or note names) and carry on from the same place.
async function rerender() {
  const was = state.playing;
  if (was) pause();
  render();
  if (was) { await midiReady; play(); }
}

const STEPS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SOLFEGE = { c: "Do", d: "Re", e: "Mi", f: "Fa", g: "Sol", a: "La", b: "Si" };

// The written letter comes from the note; the sharp/flat from how far the sounding
// pitch is from that letter, so key signatures and earlier accidentals count.
function noteName(id, style) {
  const { pname, oct } = tk.getElementAttr(id);
  const pitch = tk.getMIDIValuesForElement(id).pitch;
  const acc = { "-2": "𝄫", "-1": "♭", 1: "♯", 2: "𝄪" }[pitch - 12 * (+oct + 1) - STEPS[pname]] || "";
  return { pitch, text: (style === "solfege" ? SOLFEGE[pname] : pname.toUpperCase()) + acc };
}

// Study mode: each note's name above the top staff and below the bottom one (single
// staff: below), chords stacked highest on top. Chord symbols and tempo move up above
// the names, and the lines of music below move down to make room. Labels carry
// data-note so the player can light them up.
function addNoteNames(style) {
  scoreEl.querySelectorAll("svg.definition-scale").forEach(page => {
    let shift = 0, prevBottom = -Infinity;
    page.querySelectorAll("g.system").forEach(system => {
      const before = system.getBBox();
      const space = labelSystem(system, style);
      const after = system.getBBox();
      shift = Math.max(shift, before.y - after.y, prevBottom + space * 2 - after.y);
      system.setAttribute("transform", `translate(0, ${shift})`);
      prevBottom = after.y + after.height + shift;
    });
    // Grow the page to fit the moved lines.
    const vb = page.viewBox.baseVal;
    const margin = page.querySelector("g.page-margin").transform.baseVal[0]?.matrix.f || 0;
    const height = Math.max(vb.height, prevBottom + margin * 2);
    const outer = page.parentNode;
    outer.setAttribute("height", outer.height.baseVal.value * height / vb.height + "px");
    page.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${height}`);
  });
}

const LIFTED = "harm, tempo, dir, dynam, reh";  // text that sits above the top staff

function labelSystem(system, style) {
  const SVG = "http://www.w3.org/2000/svg";
  const measures = [...system.querySelectorAll("g.measure")];
  const staves = measures.map(m => [...m.querySelectorAll(":scope > g.staff")]);
  const lineYs = staff => [...staff.querySelectorAll(":scope > path")].map(p => p.getBBox().y);
  const ys = lineYs(staves[0][0]);
  const space = (Math.max(...ys) - Math.min(...ys)) / (ys.length - 1);
  const size = space * 1.4, gap = space * 0.6;
  const twoSided = staves[0].length > 1;

  // One label row edge per side for the whole line, clear of notes, stems, slurs and ties.
  const curves = measures.flatMap(m => [...m.querySelectorAll(":scope > g.slur, :scope > g.tie")])
    .map(c => c.getBBox());
  const topLine = Math.min(...staves.map(s => Math.min(...lineYs(s[0]))));
  const bottomLine = Math.max(...staves.map(s => Math.max(...lineYs(s.at(-1)))));
  const top = Math.min(...staves.map(s => s[0].getBBox().y),
                       ...curves.filter(b => b.y < topLine).map(b => b.y)) - gap;
  const bottom = Math.max(...staves.map(s => { const b = s.at(-1).getBBox(); return b.y + b.height; }),
                          ...curves.filter(b => b.y + b.height > bottomLine).map(b => b.y + b.height)) + gap;

  let labelsTop = top;
  const rowsAbove = [], rowsBelow = [];  // per row, the x spans taken by names
  staves.forEach(measureStaves => measureStaves.forEach((staff, si) => {
    const above = twoSided && si === 0;
    if (!above && si !== measureStaves.length - 1) return;
    const notes = [...staff.querySelectorAll("g.note")].map(n => {
      const head = (n.querySelector("g.notehead") || n).getBBox();
      return { id: n.id, x: head.x + head.width / 2, ...noteName(n.id, style) };
    }).sort((a, b) => a.x - b.x);
    const columns = [];
    notes.forEach(n => {
      const col = columns.at(-1);
      if (col && n.x - col[0].x < space) col.push(n); else columns.push([n]);
    });
    columns.forEach(col => {
      col.sort((a, b) => b.pitch - a.pitch);
      const texts = col.map(n => {
        const t = document.createElementNS(SVG, "text");
        Object.entries({ x: col[0].x, "font-size": size, "text-anchor": "middle",
                         class: "note-name", "data-note": n.id })
          .forEach(([k, v]) => t.setAttribute(k, v));
        t.textContent = n.text;
        staff.parentNode.appendChild(t);
        const half = t.getComputedTextLength() / 2 + size * 0.15;
        return { t, from: col[0].x - half, to: col[0].x + half };
      });
      // Row 0 hugs the staff. A column that would touch a neighbour's names moves out a row.
      const rows = above ? rowsAbove : rowsBelow;
      const rowOf = i => above ? col.length - 1 - i : i;
      const free = k => texts.every((l, i) =>
        !(rows[k + rowOf(i)] || []).some(([from, to]) => l.from < to && from < l.to));
      let k = 0;
      while (!free(k)) k++;
      texts.forEach((l, i) => {
        const row = k + rowOf(i);
        (rows[row] ||= []).push([l.from, l.to]);
        // Baselines: above, a name sits on its row; below, it hangs from it.
        const y = above ? top - row * size : bottom + (row + 0.8) * size;
        if (above) labelsTop = Math.min(labelsTop, y - size * 0.8);
        l.t.setAttribute("y", y);
      });
    });
  }));

  if (twoSided) {
    const lifted = measures.flatMap(m => [...m.querySelectorAll(LIFTED.split(", ").map(c => `:scope > g.${c}`).join())])
      .filter(el => { const b = el.getBBox(); return b.height && b.y < topLine; });
    const lowest = Math.max(...lifted.map(el => { const b = el.getBBox(); return b.y + b.height; }));
    const up = lowest - (labelsTop - gap);
    if (up > 0) lifted.forEach(el => el.setAttribute("transform", `translate(0, ${-up})`));
  }
  return space;
}

// ---------- Highlight and follow ----------

function light(ids, on) {
  ids.forEach(id => {
    document.getElementById(id)?.classList.toggle("playing", on);
    scoreEl.querySelector(`[data-note="${id}"]`)?.classList.toggle("playing", on);
  });
}

// Light the notes sounding at pos (used when the video leads, or after a seek).
function lightAt(pos) {
  const ids = tk.getElementsAtTime(Math.round(pos / state.speed * 1000) + 10).notes || [];
  if (ids.join() === lastIds.join()) return;
  light(lastIds, false);
  light(ids, true);
  lastIds = ids;
}

// The line (system) holding pos is the current one: full strength, kept near the middle.
function updateLine(pos, force) {
  let i = 0;
  while (i + 1 < measures.length && measures[i + 1].pos <= pos + 0.001) i++;
  const system = measures[i] && document.getElementById(measures[i].id)?.closest("g.system");
  if (!system || (system === currentSystem && !force)) return;
  currentSystem?.classList.remove("current");
  system.classList.add("current");
  currentSystem = system;
  if (state.follow) scrollToLine(force ? "auto" : "smooth");
}

function scrollToLine(behavior = "smooth") {
  if (!currentSystem || !scroller.clientHeight) return;
  const r = currentSystem.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
  scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - Math.max(16, (sr.height - r.height) * 0.4), behavior });
}

function setFollow(on) {
  state.follow = on;
  $("backToCurrent").hidden = on;
  if (on) scrollToLine();
}
// Scrolling by hand stops auto-follow until "Back to current".
["wheel", "touchmove"].forEach(t => scroller.addEventListener(t, () => state.follow && setFollow(false), { passive: true }));
scroller.addEventListener("keydown", e => /Page|Home|End|Arrow(Up|Down)/.test(e.key) && setFollow(false));
$("backToCurrent").addEventListener("click", () => setFollow(true));

// ---------- Playback ----------

const leader = () => state.source === "original" ? "video" : "sheet";
const hasMedia = () => !!video.currentSrc;

function now() {
  if (!state.playing) return state.pos;
  if (leader() === "video") return toSheet(video.currentTime);
  return Math.min(anchor.pos + (performance.now() - anchor.at) / 1000 * state.speed, state.duration);
}

async function play() {
  if (state.playing || !tk) return;
  if (state.pos >= state.duration - 0.05) state.pos = 0;
  state.playing = true;
  body.classList.add("playing");
  $("play").setAttribute("aria-label", "Pause");
  light(lastIds, false); lastIds = [];
  applyVolume();
  if (leader() === "video") {
    video.currentTime = Math.max(0, toRec(state.pos));
    video.playbackRate = state.speed;
    video.play().catch(() => pause());
  } else {
    // Start the video here too (inside the click) so Safari lets it play with sound in Both.
    if (hasMedia()) { video.currentTime = clamp(toRec(state.pos), 0, video.duration || 0); video.play().catch(() => {}); }
    await midiReady;
    if (!state.playing) return;
    player.currentTime = state.pos / state.speed;
    anchor = { pos: state.pos, at: performance.now() };
    player.start();
  }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function pause() {
  if (!state.playing) return;
  state.pos = now();
  state.playing = false;
  body.classList.remove("playing");
  $("play").setAttribute("aria-label", "Play");
  player.stop();
  video.pause();
  cancelAnimationFrame(raf);
  updateBar();
}

const toggle = () => state.playing ? pause() : play();

function seek(pos) {
  pos = clamp(pos, 0, state.duration);
  state.pos = pos;
  anchor = { pos, at: performance.now() };
  if (state.playing && leader() === "sheet") player.currentTime = pos / state.speed;
  if (hasMedia() && video.readyState) video.currentTime = clamp(toRec(pos), 0, video.duration);
  if (!state.playing || leader() === "video") lightAt(pos);
  updateLine(pos);
  setFollow(true);
  updateBar();
}

// Back to the start of this bar (or the one before when already at its start), or on to the next.
function stepBar(dir) {
  const pos = now();
  let i = 0;
  while (i + 1 < measures.length && measures[i + 1].pos <= pos + 0.01) i++;
  if (dir < 0 && measures[i] && pos - measures[i].pos > 0.4 * state.speed) dir = 0;
  const m = measures[clamp(i + dir, 0, measures.length - 1)];
  if (m) seek(m.pos);
}

// The video follows the sheet: small drifts are fixed by nudging its speed, big ones by a jump.
function followVideo(pos) {
  if (!hasMedia() || video.readyState < 2) return;
  const target = toRec(pos);
  if (target < 0 || target >= video.duration) {
    if (!video.paused) video.pause();
    video.currentTime = clamp(target, 0, video.duration);
    return;
  }
  if (video.paused) video.play().catch(() => {});
  const drift = video.currentTime - target, base = state.speed * slope(pos);
  if (Math.abs(drift) > 0.5) video.currentTime = target;
  video.playbackRate = clamp(Math.abs(drift) > 0.08 ? base - drift : base, 0.25, 4);
}

function tick() {
  if (!state.playing) return;
  const pos = now();
  if (leader() === "sheet") followVideo(pos);
  else {
    lightAt(pos);
    if (video.ended) { pause(); state.pos = state.duration; }
  }
  updateLine(pos);
  updateBar(pos);
  raf = requestAnimationFrame(tick);
}

player.addEventListener("note", e => {
  // Verovio's timemap is in ms at the rendered tempo, rounded to whole ms; look a little
  // past the onset so a note starting at 1384.6 ms (stored as 1385) isn't skipped.
  const ids = tk.getElementsAtTime(Math.round(e.detail.note.startTime * 1000) + 10).notes || [];
  light(lastIds, false);
  light(ids, true);
  lastIds = ids;
  anchor = { pos: e.detail.note.startTime * state.speed, at: performance.now() };
});
player.addEventListener("stop", e => {
  light(lastIds, false);
  lastIds = [];
  if (e.detail?.finished && state.playing && leader() === "sheet") { pause(); state.pos = state.duration; updateBar(); }
});
video.addEventListener("ended", () => leader() === "video" && pause());

// Tap a note (or its name) to jump there.
scoreEl.addEventListener("click", e => {
  const el = e.target.closest("g.note, [data-note]");
  const id = el?.dataset.note || el?.id;
  if (id) seek(tk.getTimeForElement(id) * state.speed / 1000);
});

// ---------- Sound ----------

function applyVolume() {
  const v = state.muted ? 0 : state.volume;
  video.muted = state.source === "sheet" || v === 0;
  video.volume = v;
  const out = window.Tone && (Tone.Destination || Tone.Master);
  if (out) {
    // In Both, the sheet plays quietly under the recording.
    const sheet = state.source === "original" ? 0 : state.source === "both" ? v * 0.35 : v;
    out.mute = sheet === 0;
    if (sheet) out.volume.value = Tone.gainToDb(sheet);
  }
  body.classList.toggle("muted", v === 0);
  volumeEl.value = v;
  volumeEl.style.setProperty("--p", v * 100 + "%");
}

function setSource(source) {
  const was = state.playing;
  if (was) pause();
  state.source = source;
  applyVolume();
  if (was) play();
}

function setSpeed(speed) {
  state.speed = speed;
  rerender();
}

function setNames(names) {
  state.names = names;
  updateUrl();
  rerender();
}

volumeEl.addEventListener("input", () => { state.volume = +volumeEl.value; state.muted = false; applyVolume(); });
$("mute").addEventListener("click", () => { state.muted = !state.muted; if (!state.volume) state.volume = 0.8; applyVolume(); });

// ---------- Bar ----------

let seeking = false;
function updateBar(pos = now()) {
  const p = state.duration ? clamp(pos / state.duration, 0, 1) : 0;
  if (!seeking) {
    seekEl.value = Math.round(p * 1000);
    seekEl.style.setProperty("--p", p * 100 + "%");
    $("timeNow").textContent = fmt(pos / state.speed);
  }
  $("timeEnd").textContent = fmt(state.duration / state.speed);
}
seekEl.addEventListener("input", () => {
  seeking = true;
  const pos = seekEl.value / 1000 * state.duration;
  seekEl.style.setProperty("--p", seekEl.value / 10 + "%");
  $("timeNow").textContent = fmt(pos / state.speed);
});
seekEl.addEventListener("change", () => { seeking = false; seek(seekEl.value / 1000 * state.duration); });

$("play").addEventListener("click", e => { e.stopPropagation(); toggle(); });
$("prevBar").addEventListener("click", () => stepBar(-1));
$("nextBar").addEventListener("click", () => stepBar(1));

document.addEventListener("keydown", e => {
  if (e.target.closest("input:not([type=range]), textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); if (!e.repeat) toggle(); }
  else if (e.target.type === "range") return;
  else if (e.key === "ArrowLeft") { e.preventDefault(); stepBar(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); stepBar(1); }
  else if (e.key === "Escape") closeOverlays();
});
// A focused button would also click on Space's keyup.
document.addEventListener("keyup", e => e.code === "Space" && e.target.closest("button") && e.preventDefault());

// Toggles: one click steps to the next option, the button shows the current one, and a
// short toast above the bar says what it switched to.
const TOGGLES = {
  speed: {
    values: [1, 0.75, 0.5], get: () => state.speed, set: setSpeed,
    label: v => `${String(v).replace(/^0/, "")}×`, name: v => `Speed ${v * 100}%`, on: v => v !== 1,
  },
  names: {
    values: ["", "letter", "solfege"], get: () => state.names, set: setNames,
    label: v => ({ "": "Aa", letter: "CDE", solfege: "Do" })[v],
    name: v => "Note names " + ({ "": "off", letter: "C D E", solfege: "Do Re Mi" })[v], on: v => !!v,
  },
  source: {
    values: ["sheet", "original", "both"], get: () => state.source, set: setSource,
    label: v => `<svg><use href="#i-${({ sheet: "note", original: "wave", both: "both" })[v]}"/></svg>`,
    name: v => "Sound: " + ({ sheet: "Sheet", original: "Original", both: "Both" })[v], on: v => v !== "sheet",
  },
};
function updateToggles() {
  document.querySelectorAll("[data-tog]").forEach(b => {
    const t = TOGGLES[b.dataset.tog], v = t.get();
    b.innerHTML = t.label(v);
    b.title = t.name(v);
    b.setAttribute("aria-label", t.name(v));
    b.setAttribute("aria-pressed", t.on(v));
  });
}
let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 1200);
}
document.querySelectorAll("[data-tog]").forEach(b => b.addEventListener("click", () => {
  const t = TOGGLES[b.dataset.tog];
  const next = t.values[(t.values.indexOf(t.get()) + 1) % t.values.length];
  t.set(next);
  updateToggles();
  toast(t.name(next));
}));

// The bar's height places the video card and "Back to current" above it.
new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", $("bar").offsetHeight + "px")).observe($("bar"));

// ---------- Library and video ----------

const setLibrary = open => body.classList.toggle("lib-open", open);
function closeOverlays() { setLibrary(false); }
$("scrim").addEventListener("click", closeOverlays);
$("libOpen").addEventListener("click", () => setLibrary(true));
$("libClose").addEventListener("click", () => setLibrary(false));

function setVideoOpen(open) {
  $("now").hidden = !open;
  $("videoBtn").setAttribute("aria-pressed", open);
}
$("videoBtn").addEventListener("click", () => { setVideoOpen($("now").hidden); toast($("now").hidden ? "Video off" : "Video on"); });
$("nowClose").addEventListener("click", () => setVideoOpen(false));

// Drag the video card anywhere; it goes back to its corner when the window resizes.
(() => {
  const card = $("now");
  let start = null;
  card.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    const r = card.getBoundingClientRect();
    start = { x: e.clientX - r.left, y: e.clientY - r.top };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", e => {
    if (!start) return;
    const x = clamp(e.clientX - start.x, 8, innerWidth - card.offsetWidth - 8);
    const y = clamp(e.clientY - start.y, 8, innerHeight - card.offsetHeight - 8);
    Object.assign(card.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
  });
  card.addEventListener("pointerup", () => start = null);
  addEventListener("resize", () => Object.assign(card.style, { left: "", top: "", right: "", bottom: "" }));
})();

// ---------- Songs ----------

function buildLibrary() {
  const groups = new Map();
  SONGS.forEach(s => (groups.get(s.audio) || groups.set(s.audio, []).get(s.audio)).push(s));
  $("songs").innerHTML = "";
  groups.forEach((songs, audio) => {
    const group = document.createElement("div");
    group.className = "group";
    group.innerHTML = `<div class="group-name"><span class="thumb" data-audio="${audio}"><img alt=""><svg><use href="#i-note"/></svg></span><span></span></div>`;
    group.querySelector(".group-name span:last-child").textContent = audio;
    songs.forEach(s => {
      const row = document.createElement("button");
      row.className = "row";
      row.dataset.song = s.name;
      row.title = s.name;
      row.textContent = versionOf(s);
      row.addEventListener("click", () => {
        if (s !== state.song) load(s);
        setLibrary(false);
      });
      group.appendChild(row);
    });
    $("songs").appendChild(group);
  });
}

function updateUrl() {
  const q = new URLSearchParams({ song: state.song.name });
  if (state.names) q.set("names", state.names);
  history.replaceState(null, "", "?" + q);
}

// Name, version, time signature and tempo, read from the MusicXML.
function showMeta(song) {
  const doc = new DOMParser().parseFromString(state.xml, "application/xml");
  const text = sel => doc.querySelector(sel)?.textContent;
  const time = text("time beats") && `${text("time beats")}/${text("time beat-type")}`;
  const bpm = text("per-minute");
  $("title").textContent = song.name;
  $("meta").textContent = [versionOf(song), time, bpm && `♩ = ${bpm}`].filter(Boolean).join(" · ");
  $("npName").textContent = song.name;
  $("npSub").textContent = versionOf(song);
  document.title = `${song.name} · Piano sheet player`;
  document.querySelectorAll(".row").forEach(r => r.setAttribute("aria-current", r.dataset.song === song.name));
}

async function load(song) {
  pause();
  const sameMedia = state.song && state.song.audio === song.audio && state.song.video === song.video;
  state.song = song;
  state.pos = 0;
  updateUrl();
  const [xml, timing] = await Promise.all([
    fetch(`output/${song.name}.musicxml`).then(r => r.text()),
    fetch(`output/${song.name}.timing.json`).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (state.song !== song) return;
  state.xml = xml;
  state.timing = timing;
  showMeta(song);
  body.classList.toggle("no-video", !song.video);
  if (!sameMedia) {
    video.src = song.video || `output/${song.audio}.wav`;  // the recording alone when there's no video
    setThumb(null);
  }
  render();
  setFollow(true);
  if (hasMedia() && video.readyState) video.currentTime = Math.max(0, toRec(0));
}

// The video's frame at the first note is the song's thumbnail.
let thumbDone = false;
function setThumb(src) {
  thumbDone = !!src;
  document.querySelectorAll(".thumb").forEach(t => {
    const mine = !t.dataset.audio || t.dataset.audio === state.song.audio;
    if (!mine) return;
    t.querySelector("img").src = src || "";
    t.classList.toggle("has-img", !!src);
  });
}
video.addEventListener("loadedmetadata", () => {
  if (!state.playing) video.currentTime = clamp(toRec(state.pos), 0, video.duration);
});
video.addEventListener("seeked", () => {
  if (thumbDone || !state.song?.video || !video.videoWidth) return;
  const c = document.createElement("canvas");
  c.width = 160; c.height = Math.round(160 * video.videoHeight / video.videoWidth);
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  try { setThumb(c.toDataURL("image/jpeg", 0.8)); } catch { thumbDone = true; }
});

// ---------- Start ----------

buildLibrary();
updateToggles();
applyVolume();
setVideoOpen(false);

document.addEventListener("DOMContentLoaded", () => {
  verovio.module.onRuntimeInitialized = () => {
    tk = new verovio.toolkit();
    load(SONGS.find(s => s.name === params.get("song")) || SONGS[0]);
  };
});
