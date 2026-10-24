"use client";
// Registers the service worker (out/sw.js, built by scripts/build-sw.mjs) in production only,
// so next dev never serves cached files. Shows nothing.
import { useEffect } from "react";

const base = process.env.NEXT_PUBLIC_BASE || "";

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` });
  }, []);
  return null;
}
