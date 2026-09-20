import Link from "next/link";

import { inr } from "../lib/format";
import aggregates from "./aggregates.json";
import { Leash } from "./Leash";
import { Population } from "./Population";
import { CallToAction } from "./press/CallToAction";
import { Colophon } from "./press/Colophon";
import { Hero } from "./press/Hero";
import { HowItWorks } from "./press/HowItWorks";
import { Masthead } from "./press/Masthead";
import { Screens } from "./press/Screens";
import { Standing } from "./press/Standing";
import { Misregister } from "./press/Misregister";
import { Trace } from "./Trace";

export const metadata = {
  title: "DiligenceReady: reconciliation for CA firms",
  description:
    "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
};

/**
 * The landing page, which is a working paper.
 *
 * Nothing here is claimed that the repository cannot back. No certifications
 * we do not hold, no customer logos, no testimonials, and no signup form that
 * quietly discards what someone types into it — the waitlist is an email
 * address, which is the honest version of a waitlist before there is a
 * backend for one.
 *
 * The design follows from that sentence rather than decorating it. A CA's
 * working paper carries an index, a tick mark in the margin against every
 * assertion, a legend at the foot defining those marks, a footed column, and a
 * sign-off block that stays blank until someone reviews it. This page has all
 * five, and it turns them on itself.
 *
 * The mark that appears nowhere on this page is C — confirmed with an external
 * party — because no practising CA has reviewed the rule set yet. The legend
 * says so in those words. The page's epistemic position is the layout rather
 * than a disclaimer under it, and it is why the pilot ask is a blank
 * "reviewed by" rule instead of a button.
 *
 * It ships as a server component with no client JavaScript at all. The only
 * motion is two rules drawing themselves once on load, which is the arithmetic
 * being footed.
 */

/**
 * The way into the app, from the page that is now its front door.
 *
 * It points at the form rather than at `/` on purpose. An unauthenticated
 * request to the dashboard is sent back here, so a bare link to `/` would be
 * a dead click for exactly the reader most likely to take it — the one who
 * has never signed in. Routing through `/sign-in` costs a reader who does
 * hold a session one redirect they never see, because that page checks the
 * session on the server and forwards them straight to `next`. Every link on
 * this page that goes into the product uses this, so there is no path from
 * here that bounces a visitor back to where they started.
 *
 * `next=/` is the dashboard, written out rather than left to the default so
 * the link says where it goes.
 */
const DASHBOARD = "/sign-in?next=/";

/**
 * Counts this page writes in words.
 *
 * A figure set in digits is one the reader is invited to check against
 * something; these are neither at risk nor traceable to a row, they are the
 * shape of the dataset, and spelling them keeps the digits on the page
 * meaning one thing. Anything not listed falls back to the numeral rather
 * than being spelled wrongly.
 */
const SPELLED: Record<number, string> = {
  2: "two",
  4: "four",
  12: "twelve",
  41: "forty-one",
  82: "eighty-two",
};

/** The same word, at the start of a sentence. */
function spell(n: number, sentenceStart = false): string {
  const word = SPELLED[n];
  if (!word) return String(n);
  return sentenceStart ? word[0].toUpperCase() + word.slice(1) : word;
}


export default function ProductPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-stock text-agreed">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <Masthead signIn={DASHBOARD} />
        <Hero signIn={DASHBOARD} />
        <Misregister slip={1} />
        <HowItWorks />
        <Misregister slip={0.72} />
        <Screens />
        <Misregister slip={0.48} />

        <section id="proof" className="scroll-mt-10 py-20">
          <h2 className="wdth-tight max-w-[20ch] font-anek text-opener font-bold text-agreed">
            Measured, not asserted
          </h2>
          <p className="opsz-deck mt-7 max-w-[46ch] font-news text-deck text-agreed">
            {spell(aggregates.totals.planted, true)} defects were planted across{" "}
            {spell(aggregates.totals.companies)} synthetic ledgers,{" "}
            {spell(aggregates.companies[0].evaluation.planted)} in each. The engine found
            every one of them and raised nothing the answer key does not contain.
          </p>
          <Population />
        </section>

        <Misregister slip={0.32} />

        <section className="py-20">
          <h2 className="wdth-tight max-w-[22ch] font-anek text-opener font-bold text-agreed">
            The model cannot produce a number
          </h2>
          <p className="opsz-deck mt-7 max-w-[46ch] font-news text-deck text-agreed">
            Every figure on screen is a SQL aggregate. The model is handed a finished
            finding and writes the sentence explaining it; it never sees a document, and
            any figure it does produce is checked against the finding before you see it.
          </p>
          <Leash />
        </section>

        <Misregister slip={0.2} />

        <section className="py-20">
          <h2 className="wdth-tight max-w-[20ch] font-anek text-opener font-bold text-agreed">
            Every figure has a line
          </h2>
          <p className="opsz-deck mt-7 max-w-[46ch] font-news text-deck text-agreed">
            One finding, followed from the row of the file it was read out of to the
            aggregate that puts it on a dashboard.
          </p>
          <Trace />
        </section>

        <Misregister slip={0.1} />

        <Standing />

        <CallToAction signIn={DASHBOARD} />

        <Colophon />
      </div>
    </main>
  );
}
