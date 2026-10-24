// The player: renders the sheet with Verovio, plays it with html-midi-player, lights the
// notes as they sound, follows the current line and keeps the original video in step.
// Ported from player.js line for line; the DOM is components/Player.tsx.
import { type Song, baseOf, versionOf } from "@/lib/songs";
import { type Timing, toRec as recOf, toSheet as sheetOf, slope as slopeOf } from "./timing";

const BASE = process.env.NEXT_PUBLIC_BASE || "";
const media = (file: string) => `${BASE}/media/${file}`;

// Verovio and html-midi-player come from their CDNs (<Script> in Player.tsx), which calls
// verovioLoaded() once the script has run; the WASM runtime starts a moment later.
let verovioResolve: () => void;
const verovioReady = new Promise<void>(r => verovioResolve = r);
export function verovioLoaded() {
  const m = (window as any).verovio.module;
  if (m.calledRun) verovioResolve();
  else m.onRuntimeInitialized = () => verovioResolve();
}

export type Engine = { show: (name: string | null) => void; destroy: () => void };

export function createEngine(root: HTMLElement, SONGS: Song[], navigate: (href: string) => void): Engine {
  const $ = (id: string): any => root.querySelector("#" + id);
  const player = $("player"), video: HTMLVideoElement = $("video"), scoreEl: HTMLElement = $("score"), scroller: HTMLElement = $("scroller");
  const seekEl: HTMLInputElement = $("seek"), volumeEl: HTMLInputElement = $("volume");
  const body = document.body;
  const params = new URLSearchParams(location.search);

  // Every listener, observer and timer, so destroy() can undo them (strict mode mounts twice).
  const offs: (() => void)[] = [];
  let destroyed = false;
  function on(target: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  }
  function observe(el: Element, fn: () => void) {
    const ro = new ResizeObserver(fn);
    ro.observe(el);
    offs.push(() => ro.disconnect());
  }

  // Positions ("pos") are seconds of the sheet at 100% speed. The sheet's MIDI, rendered at
  // the chosen speed, runs pos / speed; the recording runs toRec(pos).
  const state = {
    song: null as Song | null, xml: "", timing: null as Timing | null, duration: 0,
    speed: 1, names: params.get("names") || "", hand: params.get("hand") || "", source: "sheet", volume: 0.8, muted: false,
    playing: false, pos: 0, follow: true,
  };
  let tk: any, lastIds: string[] = [], measures: { pos: number; id: string }[] = [], currentSystem: Element | null = null, raf = 0;
  let anchor = { pos: 0, at: 0 };  // while the sheet plays: pos at a moment (performance.now())
  let midiReady: Promise<unknown> = Promise.resolve();
  let handOf = new Map<string, string>();  // note id -> "right" (top staff) or "left" (bottom staff)

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const fmt = (s: number) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  // ---------- Sheet time <-> recording time ----------

  const ratio = () => (video.duration || state.duration) / (state.duration || 1);
  const toRec = (pos: number) => recOf(state.timing, pos, ratio());
  const toSheet = (rec: number) => sheetOf(state.timing, rec, ratio());
  const slope = (pos: number) => slopeOf(state.timing, pos, ratio());

  // ---------- Rendering ----------

  let renderedWidth = 0, resizeTimer: ReturnType<typeof setTimeout> | undefined;

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
    markHands();
    const loaded = () => new Promise(r => player.addEventListener("load", r, { once: true }));
    midiReady = loaded().then(() => state.hand && muteOtherHand(loaded()));
    player.src = "data:audio/midi;base64," + tk.renderToMIDI();
    if (state.names) addNoteNames(state.names);  // needs the MIDI for the pitches
    const map = tk.renderToTimemap({ includeMeasures: true });
    measures = map.filter((e: any) => e.measureOn).map((e: any) => ({ pos: e.tstamp * state.speed / 1000, id: e.measureOn }));
    state.duration = (map.at(-1)?.tstamp || 0) * state.speed / 1000;
    renderedWidth = width;
    lastIds = []; currentSystem = null;
    updateLine(state.pos, true);
    updateBar();
  }

  observe(scoreEl, () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (scoreEl.clientWidth && Math.abs(scoreEl.clientWidth - renderedWidth) > 4) rerender();
    }, 200);
  });

  // Re-render (new width, speed or note names) and carry on from the same place.
  async function rerender() {
    const was = state.playing;
    if (was) pause();
    render();
    if (was) { await midiReady; play(); }
  }

  // The top staff is the right hand, the bottom one the left (a single staff counts as right).
  function markHands() {
    handOf = new Map();
    scoreEl.querySelectorAll("g.measure").forEach(m => {
      const staves = m.querySelectorAll(":scope > g.staff");
      staves.forEach((staff, i) => {
        const hand = i === 0 ? "right" : "left";
        staff.classList.add(hand);
        staff.querySelectorAll("g.note").forEach(n => handOf.set(n.id, hand));
      });
    });
    const two = [...handOf.values()].includes("left");
    $("handBtn").hidden = !two;
    if (!two) state.hand = "";
    body.dataset.hand = state.hand;
    updateToggles();
  }

  // One hand only: drop the other hand's notes from the loaded MIDI, matched by pitch and
  // onset (Verovio's ms are rounded, hence the margin). Resolves once the player reloads.
  function muteOtherHand(reloaded: Promise<unknown>) {
    const muted = new Map<number, number[]>();  // pitch -> onsets in ms
    handOf.forEach((hand, id) => {
      if (hand === state.hand) return;
      const { time, pitch } = tk.getMIDIValuesForElement(id);
      (muted.get(pitch) || muted.set(pitch, []).get(pitch)!).push(time);
    });
    const ns = player.noteSequence;
    const notes = ns.notes.filter((n: any) => !muted.get(n.pitch)?.some(t => Math.abs(t - n.startTime * 1000) < 5));
    player.noteSequence = Object.assign(Object.create(Object.getPrototypeOf(ns)), ns, { notes });
    return reloaded;
  }

  // The notes to light: with one hand on, only that hand's.
  const ofHand = (ids: string[]) => state.hand ? ids.filter(id => handOf.get(id) === state.hand) : ids;

  const STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const SOLFEGE: Record<string, string> = { c: "Do", d: "Re", e: "Mi", f: "Fa", g: "Sol", a: "La", b: "Si" };

  // The written letter comes from the note; the sharp/flat from how far the sounding
  // pitch is from that letter, so key signatures and earlier accidentals count.
  function noteName(id: string, style: string) {
    const { pname, oct } = tk.getElementAttr(id);
    const pitch: number = tk.getMIDIValuesForElement(id).pitch;
    const acc = ({ "-2": "𝄫", "-1": "♭", 1: "♯", 2: "𝄪" } as Record<string, string>)[pitch - 12 * (+oct + 1) - STEPS[pname]] || "";
    return { pitch, text: (style === "solfege" ? SOLFEGE[pname] : pname.toUpperCase()) + acc };
  }

  // Study mode: each note's name above the top staff and below the bottom one (single
  // staff: below), chords stacked highest on top. Chord symbols and tempo move up above
  // the names, and the lines of music below move down to make room. Labels carry
  // data-note so the player can light them up.
  function addNoteNames(style: string) {
    scoreEl.querySelectorAll<SVGSVGElement>("svg.definition-scale").forEach(page => {
      let shift = 0, prevBottom = -Infinity;
      page.querySelectorAll<SVGGElement>("g.system").forEach(system => {
        const before = system.getBBox();
        const space = labelSystem(system, style);
        const after = system.getBBox();
        shift = Math.max(shift, before.y - after.y, prevBottom + space * 2 - after.y);
        system.setAttribute("transform", `translate(0, ${shift})`);
        prevBottom = after.y + after.height + shift;
      });
      // Grow the page to fit the moved lines.
      const vb = page.viewBox.baseVal;
      const margin = page.querySelector<SVGGElement>("g.page-margin")!.transform.baseVal[0]?.matrix.f || 0;
      const height = Math.max(vb.height, prevBottom + margin * 2);
      const outer = page.parentNode as SVGSVGElement;
      outer.setAttribute("height", outer.height.baseVal.value * height / vb.height + "px");
      page.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${height}`);
    });
  }

  const LIFTED = "harm, tempo, dir, dynam, reh";  // text that sits above the top staff

  function labelSystem(system: SVGGElement, style: string) {
    const SVG = "http://www.w3.org/2000/svg";
    const measures = [...system.querySelectorAll("g.measure")];
    const staves = measures.map(m => [...m.querySelectorAll<SVGGElement>(":scope > g.staff")]);
    const lineYs = (staff: Element) => [...staff.querySelectorAll<SVGPathElement>(":scope > path")].map(p => p.getBBox().y);
    const ys = lineYs(staves[0][0]);
    const space = (Math.max(...ys) - Math.min(...ys)) / (ys.length - 1);
    const size = space * 1.4, gap = space * 0.6;
    const twoSided = staves[0].length > 1;

    // One label row edge per side for the whole line, clear of notes, stems, slurs and ties.
    const curves = measures.flatMap(m => [...m.querySelectorAll<SVGGElement>(":scope > g.slur, :scope > g.tie")])
      .map(c => c.getBBox());
    const topLine = Math.min(...staves.map(s => Math.min(...lineYs(s[0]))));
    const bottomLine = Math.max(...staves.map(s => Math.max(...lineYs(s.at(-1)!))));
    const top = Math.min(...staves.map(s => s[0].getBBox().y),
                         ...curves.filter(b => b.y < topLine).map(b => b.y)) - gap;
    const bottom = Math.max(...staves.map(s => { const b = s.at(-1)!.getBBox(); return b.y + b.height; }),
                            ...curves.filter(b => b.y + b.height > bottomLine).map(b => b.y + b.height)) + gap;

    let labelsTop = top;
    const rowsAbove: number[][][] = [], rowsBelow: number[][][] = [];  // per row, the x spans taken by names
    staves.forEach(measureStaves => measureStaves.forEach((staff, si) => {
      const above = twoSided && si === 0;
      if (!above && si !== measureStaves.length - 1) return;
      const notes = [...staff.querySelectorAll<SVGGElement>("g.note")].map(n => {
        const head = (n.querySelector<SVGGElement>("g.notehead") || n).getBBox();
        return { id: n.id, x: head.x + head.width / 2, ...noteName(n.id, style) };
      }).sort((a, b) => a.x - b.x);
      const columns: (typeof notes)[] = [];
      notes.forEach(n => {
        const col = columns.at(-1);
        if (col && n.x - col[0].x < space) col.push(n); else columns.push([n]);
      });
      columns.forEach(col => {
        col.sort((a, b) => b.pitch - a.pitch);
        const texts = col.map(n => {
          const t = document.createElementNS(SVG, "text");
          Object.entries({ x: col[0].x, "font-size": size, "text-anchor": "middle",
                           class: "note-name " + (si === 0 ? "right" : "left"), "data-note": n.id })
            .forEach(([k, v]) => t.setAttribute(k, String(v)));
          t.textContent = n.text;
          staff.parentNode!.appendChild(t);
          const half = t.getComputedTextLength() / 2 + size * 0.15;
          return { t, from: col[0].x - half, to: col[0].x + half };
        });
        // Row 0 hugs the staff. A column that would touch a neighbour's names moves out a row.
        const rows = above ? rowsAbove : rowsBelow;
        const rowOf = (i: number) => above ? col.length - 1 - i : i;
        const free = (k: number) => texts.every((l, i) =>
          !(rows[k + rowOf(i)] || []).some(([from, to]) => l.from < to && from < l.to));
        let k = 0;
        while (!free(k)) k++;
        texts.forEach((l, i) => {
          const row = k + rowOf(i);
          (rows[row] ||= []).push([l.from, l.to]);
          // Baselines: above, a name sits on its row; below, it hangs from it.
          const y = above ? top - row * size : bottom + (row + 0.8) * size;
          if (above) labelsTop = Math.min(labelsTop, y - size * 0.8);
          l.t.setAttribute("y", String(y));
        });
      });
    }));

    if (twoSided) {
      const lifted = measures.flatMap(m => [...m.querySelectorAll<SVGGElement>(LIFTED.split(", ").map(c => `:scope > g.${c}`).join())])
        .filter(el => { const b = el.getBBox(); return b.height && b.y < topLine; });
      const lowest = Math.max(...lifted.map(el => { const b = el.getBBox(); return b.y + b.height; }));
      const up = lowest - (labelsTop - gap);
      if (up > 0) lifted.forEach(el => el.setAttribute("transform", `translate(0, ${-up})`));
    }
    return space;
  }

  // ---------- Highlight and follow ----------

  function light(ids: string[], on: boolean) {
    ids.forEach(id => {
      document.getElementById(id)?.classList.toggle("playing", on);
      scoreEl.querySelector(`[data-note="${id}"]`)?.classList.toggle("playing", on);
    });
  }

  // Light the notes sounding at pos (used when the video leads, or after a seek).
  function lightAt(pos: number) {
    const ids = ofHand(tk.getElementsAtTime(Math.round(pos / state.speed * 1000) + 10).notes || []);
    if (ids.join() === lastIds.join()) return;
    light(lastIds, false);
    light(ids, true);
    lastIds = ids;
  }

  // The line (system) holding pos is the current one: full strength, kept near the middle.
  function updateLine(pos: number, force?: boolean) {
    let i = 0;
    while (i + 1 < measures.length && measures[i + 1].pos <= pos + 0.001) i++;
    const system = measures[i] && document.getElementById(measures[i].id)?.closest("g.system");
    if (!system || (system === currentSystem && !force)) return;
    currentSystem?.classList.remove("current");
    system.classList.add("current");
    currentSystem = system;
    if (state.follow) scrollToLine(force ? "auto" : "smooth");
  }

  function scrollToLine(behavior: ScrollBehavior = "smooth") {
    if (!currentSystem || !scroller.clientHeight) return;
    const r = currentSystem.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - Math.max(16, (sr.height - r.height) * 0.4), behavior });
  }

  function setFollow(on: boolean) {
    state.follow = on;
    $("backToCurrent").hidden = on;
    if (on) scrollToLine();
  }
  // Scrolling by hand stops auto-follow until "Back to current".
  ["wheel", "touchmove"].forEach(t => on(scroller, t, () => state.follow && setFollow(false), { passive: true }));
  on(scroller, "keydown", e => /Page|Home|End|Arrow(Up|Down)/.test(e.key) && setFollow(false));
  on($("backToCurrent"), "click", () => setFollow(true));

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

  function seek(pos: number) {
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
  function stepBar(dir: number) {
    const pos = now();
    let i = 0;
    while (i + 1 < measures.length && measures[i + 1].pos <= pos + 0.01) i++;
    if (dir < 0 && measures[i] && pos - measures[i].pos > 0.4 * state.speed) dir = 0;
    const m = measures[clamp(i + dir, 0, measures.length - 1)];
    if (m) seek(m.pos);
  }

  // The video follows the sheet: small drifts are fixed by nudging its speed, big ones by a jump.
  function followVideo(pos: number) {
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

  on(player, "note", e => {
    // Verovio's timemap is in ms at the rendered tempo, rounded to whole ms; look a little
    // past the onset so a note starting at 1384.6 ms (stored as 1385) isn't skipped.
    // scripts/check_highlight.py checks every sheet with the same margin.
    const ids = ofHand(tk.getElementsAtTime(Math.round(e.detail.note.startTime * 1000) + 10).notes || []);
    light(lastIds, false);
    light(ids, true);
    lastIds = ids;
    anchor = { pos: e.detail.note.startTime * state.speed, at: performance.now() };
  });
  on(player, "stop", e => {
    light(lastIds, false);
    lastIds = [];
    if (e.detail?.finished && state.playing && leader() === "sheet") { pause(); state.pos = state.duration; updateBar(); }
  });
  on(video, "ended", () => leader() === "video" && pause());

  // Tap a note (or its name) to jump there.
  on(scoreEl, "click", e => {
    const el = e.target.closest("g.note, [data-note]");
    const id = el?.dataset.note || el?.id;
    if (id) seek(tk.getTimeForElement(id) * state.speed / 1000);
  });

  // ---------- Sound ----------

  function applyVolume() {
    const v = state.muted ? 0 : state.volume;
    video.muted = state.source === "sheet" || v === 0;
    video.volume = v;
    const Tone = (window as any).Tone;
    const out = Tone && (Tone.Destination || Tone.Master);
    if (out) {
      // In Both, the sheet plays quietly under the recording.
      const sheet = state.source === "original" ? 0 : state.source === "both" ? v * 0.35 : v;
      out.mute = sheet === 0;
      if (sheet) out.volume.value = Tone.gainToDb(sheet);
    }
    body.classList.toggle("muted", v === 0);
    volumeEl.value = String(v);
    volumeEl.style.setProperty("--p", v * 100 + "%");
  }

  function setSource(source: string) {
    const was = state.playing;
    if (was) pause();
    state.source = source;
    applyVolume();
    if (was) play();
  }

  function setSpeed(speed: number) {
    state.speed = speed;
    rerender();
  }

  function setNames(names: string) {
    state.names = names;
    updateUrl();
    rerender();
  }

  function setHand(hand: string) {
    state.hand = hand;
    updateUrl();
    rerender();
  }

  on(volumeEl, "input", () => { state.volume = +volumeEl.value; state.muted = false; applyVolume(); });
  on($("mute"), "click", () => { state.muted = !state.muted; if (!state.volume) state.volume = 0.8; applyVolume(); });

  // ---------- Bar ----------

  let seeking = false;
  function updateBar(pos = now()) {
    const p = state.duration ? clamp(pos / state.duration, 0, 1) : 0;
    if (!seeking) {
      seekEl.value = String(Math.round(p * 1000));
      seekEl.style.setProperty("--p", p * 100 + "%");
      $("timeNow").textContent = fmt(pos / state.speed);
    }
    $("timeEnd").textContent = fmt(state.duration / state.speed);
  }
  on(seekEl, "input", () => {
    seeking = true;
    const pos = +seekEl.value / 1000 * state.duration;
    seekEl.style.setProperty("--p", +seekEl.value / 10 + "%");
    $("timeNow").textContent = fmt(pos / state.speed);
  });
  on(seekEl, "change", () => { seeking = false; seek(+seekEl.value / 1000 * state.duration); });

  on($("play"), "click", e => { e.stopPropagation(); toggle(); });
  on($("prevBar"), "click", () => stepBar(-1));
  on($("nextBar"), "click", () => stepBar(1));

  on(document, "keydown", e => {
    if (e.target.closest("input:not([type=range]), textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) toggle(); }
    else if (e.target.type === "range") return;
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepBar(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepBar(1); }
    else if (e.key === "Escape") closeOverlays();
  });
  // A focused button would also click on Space's keyup.
  on(document, "keyup", e => e.code === "Space" && e.target.closest("button") && e.preventDefault());

  // Toggles: one click steps to the next option, the button shows the current one, and a
  // short toast above the bar says what it switched to.
  type Toggle = { values: any[]; get: () => any; set: (v: any) => void; label: (v: any) => string; name: (v: any) => string; on: (v: any) => boolean };
  const TOGGLES: Record<string, Toggle> = {
    speed: {
      values: [1, 0.75, 0.5], get: () => state.speed, set: setSpeed,
      label: v => `${String(v).replace(/^0/, "")}×`, name: v => `Speed ${v * 100}%`, on: v => v !== 1,
    },
    names: {
      values: ["", "letter", "solfege"], get: () => state.names, set: setNames,
      label: v => ({ "": "Aa", letter: "CDE", solfege: "Do" } as any)[v],
      name: v => "Note names " + ({ "": "off", letter: "C D E", solfege: "Do Re Mi" } as any)[v], on: v => !!v,
    },
    hand: {
      values: ["", "right", "left"], get: () => state.hand, set: setHand,
      label: v => ({ "": "LR", right: "R", left: "L" } as any)[v],
      name: v => ({ "": "Both hands", right: "Right hand only", left: "Left hand only" } as any)[v], on: v => !!v,
    },
    source: {
      values: ["sheet", "original", "both"], get: () => state.source, set: setSource,
      label: v => `<svg><use href="#i-${({ sheet: "note", original: "wave", both: "both" } as any)[v]}"/></svg>`,
      name: v => "Sound: " + ({ sheet: "Sheet", original: "Original", both: "Both" } as any)[v], on: v => v !== "sheet",
    },
  };
  function updateToggles() {
    root.querySelectorAll<HTMLElement>("[data-tog]").forEach(b => {
      const t = TOGGLES[b.dataset.tog!], v = t.get();
      b.innerHTML = t.label(v);
      b.title = t.name(v);
      b.setAttribute("aria-label", t.name(v));
      b.setAttribute("aria-pressed", String(t.on(v)));
    });
  }
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(text: string) {
    $("toast").textContent = text;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 1200);
  }
  root.querySelectorAll<HTMLElement>("[data-tog]").forEach(b => on(b, "click", () => {
    const t = TOGGLES[b.dataset.tog!];
    const next = t.values[(t.values.indexOf(t.get()) + 1) % t.values.length];
    t.set(next);
    updateToggles();
    toast(t.name(next));
  }));

  // The bar's height places the video card and "Back to current" above it.
  observe($("bar"), () => document.documentElement.style.setProperty("--bar-h", $("bar").offsetHeight + "px"));

  // ---------- Library and video ----------

  const setLibrary = (open: boolean) => body.classList.toggle("lib-open", open);
  function closeOverlays() { setLibrary(false); }
  on($("scrim"), "click", closeOverlays);
  on($("libOpen"), "click", () => setLibrary(true));
  on($("libClose"), "click", () => setLibrary(false));

  function setVideoOpen(open: boolean) {
    $("now").hidden = !open;
    $("videoBtn").setAttribute("aria-pressed", open);
  }
  on($("videoBtn"), "click", () => { setVideoOpen($("now").hidden); toast($("now").hidden ? "Video off" : "Video on"); });
  on($("nowClose"), "click", () => setVideoOpen(false));

  // Drag the video card anywhere; it goes back to its corner when the window resizes.
  (() => {
    const card = $("now");
    let start: { x: number; y: number } | null = null;
    on(card, "pointerdown", e => {
      if (e.target.closest("button")) return;
      const r = card.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      card.setPointerCapture(e.pointerId);
    });
    on(card, "pointermove", e => {
      if (!start) return;
      const x = clamp(e.clientX - start.x, 8, innerWidth - card.offsetWidth - 8);
      const y = clamp(e.clientY - start.y, 8, innerHeight - card.offsetHeight - 8);
      Object.assign(card.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
    });
    on(card, "pointerup", () => start = null);
    on(window, "resize", () => Object.assign(card.style, { left: "", top: "", right: "", bottom: "" }));
  })();

  // ---------- Songs ----------

  // The page for a song, keeping the note names and hand.
  function hrefOf(song: Song) {
    const q = new URLSearchParams(Object.entries({ names: state.names, hand: state.hand }).filter(([, v]) => v));
    return `/song/${song.name}/` + (q.size ? "?" + q : "");
  }

  function buildLibrary() {
    const groups = new Map<string, Song[]>();
    SONGS.forEach(s => (groups.get(baseOf(s)) || groups.set(baseOf(s), []).get(baseOf(s))!).push(s));
    $("songs").innerHTML = "";
    groups.forEach((songs, audio) => {
      const group = document.createElement("div");
      group.className = "group";
      group.innerHTML = `<div class="group-name"><span class="thumb" data-audio="${audio}"><img alt=""><svg><use href="#i-note"/></svg></span><span></span></div>`;
      group.querySelector(".group-name span:last-child")!.textContent = audio;
      songs.forEach(s => {
        const row = document.createElement("button");
        row.className = "row";
        row.dataset.song = s.name;
        row.title = s.name;
        row.textContent = versionOf(s);
        row.addEventListener("click", () => {
          if (s !== state.song) navigate(hrefOf(s));
          setLibrary(false);
        });
        group.appendChild(row);
      });
      $("songs").appendChild(group);
    });
  }

  // Next's router picks up history.replaceState, so this doesn't reload anything.
  function updateUrl() {
    history.replaceState(null, "", BASE + hrefOf(state.song!));
  }

  // Name, version, time signature and tempo, read from the MusicXML.
  function showMeta(song: Song) {
    const doc = new DOMParser().parseFromString(state.xml, "application/xml");
    const text = (sel: string) => doc.querySelector(sel)?.textContent;
    const time = text("time beats") && `${text("time beats")}/${text("time beat-type")}`;
    const bpm = text("per-minute");
    $("title").textContent = song.name;
    $("meta").textContent = [versionOf(song), time, bpm && `♩ = ${bpm}`].filter(Boolean).join(" · ");
    $("npName").textContent = song.name;
    $("npSub").textContent = versionOf(song);
    document.title = `${song.name} · Piano sheet`;
    root.querySelectorAll(".row").forEach(r => r.setAttribute("aria-current", String((r as HTMLElement).dataset.song === song.name)));
  }

  async function load(song: Song) {
    pause();
    const sameMedia = state.song && baseOf(state.song) === baseOf(song) && state.song.video === song.video;
    state.song = song;
    state.pos = 0;
    updateUrl();
    const [xml, timing] = await Promise.all([
      fetch(media(`${song.name}.musicxml`)).then(r => r.ok ? r.text() : null).catch(() => null),
      fetch(media(`${song.name}.timing.json`)).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (state.song !== song || destroyed) return;
    if (!xml) {  // offline, and the song hasn't been opened before (see sw/sw.ts)
      state.xml = "";
      showMeta(song);
      scoreEl.innerHTML = `<p class="score-msg">Can't load this sheet. You're offline and it hasn't been opened before.</p>`;
      return;
    }
    state.xml = xml;
    state.timing = timing;
    showMeta(song);
    body.classList.toggle("no-video", !song.video);
    if (!sameMedia) {
      video.src = media(song.video || song.audio);  // the recording alone when there's no video
      setThumb(null);
    }
    render();
    setFollow(true);
    if (hasMedia() && video.readyState) video.currentTime = Math.max(0, toRec(0));
  }

  // The video's frame at the first note is the song's thumbnail.
  let thumbDone = false;
  function setThumb(src: string | null) {
    thumbDone = !!src;
    root.querySelectorAll<HTMLElement>(".thumb").forEach(t => {
      const mine = !t.dataset.audio || t.dataset.audio === baseOf(state.song!);
      if (!mine) return;
      t.querySelector("img")!.src = src || "";
      t.classList.toggle("has-img", !!src);
    });
  }
  on(video, "loadedmetadata", () => {
    if (!state.playing) video.currentTime = clamp(toRec(state.pos), 0, video.duration);
  });
  on(video, "seeked", () => {
    if (thumbDone || !state.song?.video || !video.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = 160; c.height = Math.round(160 * video.videoHeight / video.videoWidth);
    c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
    try { setThumb(c.toDataURL("image/jpeg", 0.8)); } catch { thumbDone = true; }
  });

  // ---------- Start ----------

  buildLibrary();
  updateToggles();
  applyVolume();
  setVideoOpen(false);

  // The song the page asks for (/song/<name>/, or the old ?song=), else the first one.
  let wanted: Song | null = null;
  function show(name: string | null) {
    wanted = SONGS.find(s => s.name === (name || new URLSearchParams(location.search).get("song"))) || SONGS[0];
    if (tk && wanted !== state.song) load(wanted);
  }

  Promise.all([verovioReady, customElements.whenDefined("midi-player")]).then(() => {
    if (destroyed) return;
    tk = new (window as any).verovio.toolkit();
    if (wanted) load(wanted);
  });

  return {
    show,
    destroy() {
      destroyed = true;
      pause();
      offs.forEach(off => off());
      clearTimeout(resizeTimer);
      clearTimeout(toastTimer);
      cancelAnimationFrame(raf);
    },
  };
}
