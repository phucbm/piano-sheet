import type { DetailedHTMLProps, HTMLAttributes } from "react";

// <midi-player> from html-midi-player (loaded from the CDN in Player.tsx).
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "midi-player": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { "sound-font"?: string };
    }
  }
}
