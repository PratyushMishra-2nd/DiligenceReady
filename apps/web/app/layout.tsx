import type { Metadata } from "next";
import localFont from "next/font/local";

import { PrintExpander } from "./components/PrintExpander";
import { Cursor } from "./press/Cursor";
import { MotionFallback } from "./press/MotionFallback";
import { SITE_URL } from "./lib/site";
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

/**
 * What a link to this product looks like before anyone has opened it.
 *
 * This was a title and a description and nothing else, which meant every paste
 * of the URL into WhatsApp or LinkedIn — the two channels an Indian CA firm
 * actually hears about software through — rendered as a blank card with a
 * hostname under it. `metadataBase` is what makes the rest of it resolvable:
 * a crawler is not on this origin, so a relative image path is not an image.
 *
 * `og.png` is photographed from the `/og` route in the page's own two faces
 * rather than drawn by the OG renderer, for the reason written in that file.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DiligenceReady: reconciliation for CA firms",
    template: "%s · DiligenceReady",
  },
  description:
    "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
  applicationName: "DiligenceReady",
  openGraph: {
    type: "website",
    siteName: "DiligenceReady",
    locale: "en_IN",
    url: "/",
    title: "Reconciled the week 2B lands.",
    description:
      "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "DiligenceReady — three systems, one truth. ₹16,25,635.64 of input tax credit paid and not yet claimable across two client companies.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reconciled the week 2B lands.",
    description:
      "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${plexSans.variable} ${plexMono.variable}`}>
      {/* Nothing is preloaded by hand any more. The three `<link rel=preload>`
          tags that used to sit here served Anek and Newsreader, which were
          declared by hand in globals.css because they needed a `unicode-range`
          that `next/font` cannot express. Both faces are gone; the two that
          remain go through `next/font/local`, which emits its own preloads
          with the right crossorigin and the right fetch priority. */}
      {/* No `bg-canvas` here. The ground is painted by `html` in globals.css,
          and it has to be: a background on the body paints an opaque box in
          the root stacking context, directly over the fixed weather layer at
          z-index -1. The utility class also outranks the `body` element rule
          that tried to make it transparent, so the layer rendered every frame,
          correctly sized, at full opacity, and was never once visible. */}
      <body className="min-h-screen font-sans text-copy-17 leading-normal text-ink antialiased">
        <PrintExpander />
        <Cursor />
        <MotionFallback />
        {children}
      </body>
    </html>
  );
}
