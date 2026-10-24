"use client";
// The player's markup (same ids and classes as before, so globals.css is the old player.css).
// It's mounted once in the root layout: moving between song pages keeps the same <video>.
// lib/player/engine.ts owns everything inside it after the first render.
import { memo, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import Icons from "./Icons";
import { SONGS } from "@/lib/songs";
import { type Engine, createEngine, verovioLoaded } from "@/lib/player/engine";

export default function Player() {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const push = useRef(router.push);
  push.current = router.push;

  useEffect(() => {
    const e = createEngine(root.current!, SONGS, href => push.current(href));
    engine.current = e;
    return () => { e.destroy(); engine.current = null; };
  }, []);

  useEffect(() => {
    engine.current?.show(decodeURIComponent(pathname.match(/\/song\/([^/]+)/)?.[1] || "") || null);
  }, [pathname]);

  return (
    <div ref={root} style={{ display: "contents" }}>
      <Script src="https://www.verovio.org/javascript/latest/verovio-toolkit-wasm.js" strategy="afterInteractive" onReady={verovioLoaded} />
      <Script src="https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/music@1.23.1/es6/core.js,npm/focus-visible@5,npm/html-midi-player@1.5.0" strategy="afterInteractive" />
      <Markup />
    </div>
  );
}

// Never re-renders, so React doesn't touch what the engine changed.
const Markup = memo(function Markup() {
  return (
    <>
      <Icons />

      <main className="sheet-pane">
        <header className="sheet-head">
          <h1 id="title">Loading…</h1>
          <p id="meta"></p>
        </header>
        <div className="scroller" id="scroller">
          <div className="paper" id="score"></div>
        </div>
        <div className="keys-pane"><canvas id="keys"></canvas></div>
        <button className="glass light pill back-pill" id="backToCurrent" hidden>Back to current</button>
        <div className="count" id="count" hidden aria-live="polite"><small>Loop again</small><b id="countNum"></b><span id="countDots"></span></div>
      </main>

      <div className="now glass" id="now" hidden>
        <div className="video-wrap">
          <video id="video" playsInline webkit-playsinline="" preload="auto" muted></video>
          <div className="no-video"><svg><use href="#i-note"/></svg></div>
        </div>
        <button className="now-close" id="nowClose" aria-label="Close video"><svg><use href="#i-close"/></svg></button>
      </div>

      <footer className="bar glass" id="bar">
        {/* The disc is play/pause and spins while playing; the ring around it is the seek bar. */}
        <div className="disc" id="ring" role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
          <svg className="ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle className="ring-track" cx="36" cy="36" r="33"/>
            <circle className="ring-fill" id="ringFill" cx="36" cy="36" r="33" pathLength="100"/>
          </svg>
          <span className="ring-knob" id="ringKnob"><i/></span>
          <button className="disc-btn" id="play" aria-label="Play / pause" title="Play / pause (Space)">
            <span className="thumb art"><img alt=""/></span>
            <span className="disc-icon"><svg className="i-play"><use href="#i-play"/></svg><svg className="i-pause"><use href="#i-pause"/></svg></span>
          </button>
        </div>
        <div className="np">
          <button className="np-title" id="songBtn" aria-haspopup="true" aria-expanded="false" aria-controls="songMenu" title="Switch song"><b id="npName"></b><svg><use href="#i-chevron"/></svg></button>
          <small className="np-time"><span id="timeNow">0:00</span> / <span id="timeEnd">0:00</span></small>
        </div>
        <div className="side">
          <button className="btn icon" id="prevBar" aria-label="Back one bar" title="Back one bar (←)"><svg><use href="#i-prev"/></svg></button>
          <button className="btn icon" id="nextBar" aria-label="Forward one bar" title="Forward one bar (→)"><svg><use href="#i-next"/></svg></button>
          <button className="btn icon tog" id="loopBtn" data-tog="loop"></button>
          <button className="btn icon tog" id="speedBtn" data-tog="speed"></button>
          <button className="btn icon tog" id="namesBtn" data-tog="names"></button>
          <button className="btn icon tog" id="handBtn" data-tog="hand"></button>
          <button className="btn icon tog" id="soundBtn" data-tog="sound"></button>
          <button className="btn icon tog" id="levelBtn" data-tog="level" hidden></button>
          <button className="btn icon tog" id="sourceBtn" data-tog="source"></button>
          <button className="btn icon tog" id="viewBtn" data-tog="view"></button>
          <div className="volume">
            <button className="btn icon" id="mute" aria-label="Mute" title="Mute"><svg className="i-volume"><use href="#i-volume"/></svg><svg className="i-mute"><use href="#i-mute"/></svg></button>
            <input type="range" id="volume" min="0" max="1" step="0.01" defaultValue="0.8" aria-label="Volume"/>
          </div>
          <button className="btn icon" id="downloadBtn" aria-label="Download the sheet" title="Download the sheet as an image"><svg><use href="#i-download"/></svg></button>
          <button className="btn icon tog" id="videoBtn" aria-label="Video" title="Show / hide the video"><svg><use href="#i-video"/></svg></button>
        </div>
        <div className="menu" id="songMenu" hidden>
          <nav id="songs" aria-label="Songs"></nav>
          <p className="hint">Red = notes playing now. Tap a note to jump to it.<br/>The sheet is auto-transcribed — trust your ears.<span className="version">v{process.env.NEXT_PUBLIC_VERSION}</span></p>
        </div>
        <div className="toast" id="toast" aria-live="polite"></div>
      </footer>
      {/* Salamander: a sampled Yamaha grand with 16 loudness layers (the default has 8). */}
      <midi-player id="player" sound-font="https://storage.googleapis.com/magentadata/js/soundfonts/salamander" hidden></midi-player>
    </>
  );
});
