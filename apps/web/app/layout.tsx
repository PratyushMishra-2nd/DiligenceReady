import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { PrintExpander } from "./components/PrintExpander";
import "./globals.css";

/**
 * IBM Plex earns its place here rather than being a house style: this
 * interface is read by someone cross-checking GSTINs and invoice numbers
 * character by character, and Plex Mono's disambiguated 0/O and 1/l/I are the
 * difference between catching a transposed digit and not.
 *
 * It is loaded through `next/font` rather than an `@import` inside the
 * stylesheet, which is what this used to do. That import was a third-wave
 * request — HTML, then CSS, then Google's CSS, then the font file — so every
 * cold load painted in the fallback first, and `Consolas` and Plex Mono do not
 * share a digit advance width. A column of rupee figures re-measured itself
 * mid-read on the one product whose typographic argument is that you will read
 * those digits one at a time. `next/font` self-hosts the files at build,
 * preloads them, and emits a metric-adjusted fallback so the shift is ~0. It
 * also removes a runtime request to a third party from a page rendering a
 * client's financial data.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
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
