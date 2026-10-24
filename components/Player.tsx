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

      <aside className="library" id="library" aria-label="Library">
        <div className="panel-head">
          <h2>Library</h2>
          <button className="btn icon" id="libClose" aria-label="Close library"><svg><use href="#i-close"/></svg></button>
        </div>
        <nav id="songs"></nav>
        <p className="hint">Red = notes playing now. Tap a note to jump to it.<br/>The sheet is auto-transcribed — trust your ears.</p>
      </aside>

      <main className="sheet-pane">
        <header className="sheet-head">
          <button className="btn icon" id="libOpen" aria-label="Library" title="Library"><svg><use href="#i-menu"/></svg></button>
          <h1 id="title">Loading…</h1>
          <p id="meta"></p>
        </header>
        <div className="scroller" id="scroller">
          <div className="paper" id="score"></div>
        </div>
        <button className="glass light pill back-pill" id="backToCurrent" hidden>Back to current</button>
      </main>

      <div className="now glass" id="now" hidden>
        <div className="video-wrap">
          <video id="video" playsInline webkit-playsinline="" preload="auto" muted></video>
          <div className="no-video"><svg><use href="#i-note"/></svg></div>
        </div>
        <button className="now-close" id="nowClose" aria-label="Close video"><svg><use href="#i-close"/></svg></button>
      </div>

      <footer className="bar glass" id="bar">
        <div className="np">
          <span className="thumb"><img id="thumb" alt=""/><svg><use href="#i-note"/></svg></span>
          <span className="np-text"><b id="npName"></b><small id="npSub"></small></span>
        </div>
        <div className="transport">
          <div className="buttons">
            <button className="btn icon" id="prevBar" aria-label="Back one bar" title="Back one bar (←)"><svg><use href="#i-prev"/></svg></button>
            <button className="icon play" id="play" aria-label="Play" title="Play / pause (Space)"><svg className="i-play"><use href="#i-play"/></svg><svg className="i-pause"><use href="#i-pause"/></svg></button>
            <button className="btn icon" id="nextBar" aria-label="Forward one bar" title="Forward one bar (→)"><svg><use href="#i-next"/></svg></button>
          </div>
          <div className="seek">
            <span id="timeNow">0:00</span>
            <input type="range" id="seek" min="0" max="1000" defaultValue="0" step="1" aria-label="Seek"/>
            <span id="timeEnd">0:00</span>
          </div>
        </div>
        <div className="side">
          <button className="btn icon tog" id="speedBtn" data-tog="speed"></button>
          <button className="btn icon tog" id="namesBtn" data-tog="names"></button>
          <button className="btn icon tog" id="sourceBtn" data-tog="source"></button>
          <div className="volume">
            <button className="btn icon" id="mute" aria-label="Mute" title="Mute"><svg className="i-volume"><use href="#i-volume"/></svg><svg className="i-mute"><use href="#i-mute"/></svg></button>
            <input type="range" id="volume" min="0" max="1" step="0.01" defaultValue="0.8" aria-label="Volume"/>
          </div>
          <button className="btn icon tog" id="videoBtn" aria-label="Video" title="Show / hide the video"><svg><use href="#i-video"/></svg></button>
        </div>
        <div className="toast" id="toast" aria-live="polite"></div>
      </footer>
      <div className="scrim" id="scrim"></div>
      <midi-player id="player" sound-font="" hidden></midi-player>
    </>
  );
});
