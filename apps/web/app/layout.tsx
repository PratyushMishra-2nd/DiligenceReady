import type { Metadata } from "next";
import localFont from "next/font/local";

import { PrintExpander } from "./components/PrintExpander";
import "./globals.css";

/**
 * IBM Plex, self-hosted from IBM's own build rather than Google's.
 *
 * Plex earns its place here rather than being a house style: this interface is
 * read by someone cross-checking GSTINs and invoice numbers character by
 * character, and a zero that cannot be mistaken for an O is the difference
 * between catching a transposed digit and not.
 *
 * The files are IBM's, subsetted here, because Google's build of Plex is
 * stripped of its OpenType layout features. Checked rather than assumed: the
 * Google-served files carry `GSUB = [ccmp, dnom, frac, numr]` and no `zero`
 * feature at all, so the slashed zero cannot be reached from CSS. IBM's build
 * carries `zero` and `ss03` and the alternate glyphs they map to.
 *
 * That matters unevenly across the two faces, and the uneven part is the
 * reason for the change:
 *
 *   Plex Mono's default zero is already dotted — three contours, the third a
 *   124x118 oval in the centre of the counter. Every GSTIN and sha256 on
 *   screen has always been disambiguated, and this change does not rescue
 *   that.
 *
 *   Plex Sans's default zero is plain. Two contours, no mark. And the figures
 *   this product exists to be trusted about — the exposure on the dashboard,
 *   the footed total — are set in the sans, not the mono. The one place the
 *   argument above actually needed to hold was the one place it did not.
 *
 * `globals.css` therefore turns `zero` on for the whole document, so a zero is
 * slashed wherever it appears and the two faces agree with each other.
 *
 * Subsetted to the codepoints this product renders, which is also why the set
 * is smaller than what it replaces while carrying more: 130KB across seven
 * weights, and it includes U+20B9 and U+2713. Google's subset had the rupee
 * but not the tick, so the mark in the findings list was being drawn by
 * whatever the operating system offered.
 *
 * Self-hosting the files also takes a network call to a third party out of the
 * build. `next/font/google` downloads from Google at build time, which is a
 * step that can fail in a deploy container for reasons that have nothing to do
 * with this repository.
 */
const plexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-sans",
  // The fallback is metric-adjusted rather than merely named. A column of
  // rupee figures that re-measures itself when the real face arrives is the
  // one reflow this product cannot afford, on the one screen whose argument is
  // that you will read those digits one at a time.
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: "DiligenceReady",
  description:
    "Continuous reconciliation of books, GST and bank data for Indian SMEs, built for the CA firms who do the work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-body leading-normal text-ink antialiased">
        <PrintExpander />
        {children}
      </body>
    </html>
  );
}
