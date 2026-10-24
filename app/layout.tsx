import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Player from "@/components/Player";
import { SITE } from "@/lib/songs";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE + "/"),
  title: "Piano sheet player",
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#121212",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <Player />
        {children}
      </body>
    </html>
  );
}
