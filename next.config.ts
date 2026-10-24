import type { NextConfig } from "next";

const base = process.env.NODE_ENV === "production" ? "/piano-sheet" : "";

const config: NextConfig = {
  output: "export",
  basePath: base,
  trailingSlash: true, // song/x/index.html, which Pages serves without .html
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE: base },
  agentRules: false, // next dev would write an AGENTS.md
};

export default config;
