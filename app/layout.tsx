import type { Metadata, Viewport } from "next";
import { Bebas_Neue, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";

// Self-hosted via next/font (downloaded at build time, served from our own
// origin) so the type system still renders offline — this app must keep
// working with no network. Bebas Neue is the condensed all-caps "plate"
// face used sparingly for headings and the bib-chip signature element;
// IBM Plex Sans/Mono share an engineering lineage for UI text vs. tabular
// timing digits.
//
// Bebas Neue only ships one weight (400) — it's already a heavy poster
// face by design, so don't pair it with a font-bold/font-extrabold utility
// (there's no matching weight to switch to, and Turbopack doesn't
// synthesize one). Earlier this was "Big Shoulders", which Google
// renamed/split at some point; next/font's bundled fallback-metrics table
// still only has the old split names, so every build logged a "failed to
// find font override values" warning with no real fix on the Turbopack
// dev path (adjustFontFallback: false only suppresses it under webpack).
// Bebas Neue has no such mismatch.
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-neue",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EBDC Timing - C510",
  description: "East Bay Dirt Classic Race Timing System",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EBDC Timing",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#33402e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="antialiased font-sans bg-sand text-ink">
        <Image
          src="/ebdc-sticker.webp"
          alt=""
          aria-hidden="true"
          width={610}
          height={566}
          priority
          className="fixed top-3 right-3 z-40 w-16 sm:w-20 h-auto drop-shadow-lg select-none pointer-events-none"
        />
        {children}
      </body>
    </html>
  );
}
