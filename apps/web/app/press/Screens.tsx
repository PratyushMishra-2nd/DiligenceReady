import { Plate } from "./Plate";
import { Opener, slipFor } from "./Sheet";

/**
 * What you can do in it, screen by screen — and now, what those screens
 * actually look like.
 *
 * This section used to be eight rows of prose about surfaces the reader could
 * not see. It read as a contents page for a document that was never attached,
 * which on a page arguing that every claim should be checkable was the one
 * place it asked to be believed.
 *
 * Three plates carry it now: the register agreeing with itself, the exceptions
 * that fell out, and the one register whose rules are written and switched
 * off. The index sits beside them rather than under them, because a reader who
 * wants the shape of the whole product in eight lines should not have to
 * scroll three screenshots to get it.
 */

const SCREENS: [string, string][] = [
  [
    "Firm dashboard",
    "Which of my clients needs attention this month, and how much is on the line for each",
  ],
  [
    "Readiness",
    "How much of the purchase register reconciles against GSTR-2B and the bank, and what does not",
  ],
  [
    "Findings",
    "Every exception the engine raised, by severity and by rupee value, each with its calculation",
  ],
  [
    "Evidence",
    "The original file, the row inside it, and the match that produced the figure",
  ],
  [
    "IMS decisions",
    "Accept, reject or leave pending, and what leaving it pending is worth in rupees",
  ],
  [
    "Ask the ledger",
    "A question in English, answered from the engine's own aggregates, with the queries shown",
  ],
  [
    "Upload",
    "Drop a Tally, GSTR-2B or bank export in and the same pipeline reads it",
  ],
  [
    "Lender package",
    "The whole month as one printable document",
  ],
];

export function Screens() {
  return (
    <section id="screens" className="scroll-mt-24 py-14 lg:pl-20">
      <Opener slip={slipFor("screens")} size="text-opener-tight" className="optical-cap max-w-[24ch]">
        Eight screens, one question each
      </Opener>

      {/* Plates on the left, the contents page beside them.
          Stacked full-width, the three plates alone ran to over three
          thousand pixels — one section costing four screens of a page that
          already asks for too many. A plate has to be legible, not large, and
          these are crops rather than whole windows: at 700px the readiness
          percentages and the rupee figures still read, and the schedule that
          was underneath now uses the horizontal space the measure was leaving
          empty anyway. */}
      {/* The first column demanded a fixed 820px and the second took
          whatever was left. At a 1024px viewport there is not 820px left:
          944 of measure, less 80 of `lg:pl-20`, less 48 of gutter, is 816 —
          four pixels short before the index column is allowed to exist at
          all, so `minmax(0,1fr)` resolved it to zero and the contents page
          collapsed while still holding 22px headings. Every 13-inch laptop
          lands in that band.
          The plates take the flexible column now and the index gets the
          floor, which is the correct way round: a screenshot can be any
          width and still be a screenshot, and a list of headings cannot. */}
      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
        <div className="min-w-0 space-y-10">
        <Plate
          shot="readiness"
          index="Plate 2"
          sizes="(min-width: 1280px) 780px, (min-width: 1024px) 58vw, 100vw"
          alt="The readiness screen for Vertex Components, August 2026: purchase register 96.1% reconciled against GSTR-2B, bank statement 98.5% reconciled against vouchers, and beside them the exposed column — 3.31 lakh of input tax credit with no 2B counterpart, 21.61 lakh of bank and books variance, a Rule 37A reversal of 96,797.70."
          caption="One client, one period. What reconciled on the left, what it costs on the right, and a rail of twelve months across the top. The percentages are counts, not estimates: 146 of 152 documents, 193 of 196 lines."
        />

        <Plate
          shot="findings"
          index="Plate 3"
          sizes="(min-width: 1280px) 780px, (min-width: 1024px) 58vw, 100vw"
          alt="The findings list: seventeen exceptions for one company and period, filtered by All, GST, Bank and Commercial, each row naming a supplier, a document number and a rupee figure — unattributed RTGS deposits, a Rule 37A reversal, values that differ from 2B, invoices with no 2B counterpart."
          caption="Every exception the engine raised for the month, worst first, each one a row in a match table rather than a judgment. Click any of them and the arithmetic opens beside it."
        />

        <Plate
          shot="ims"
          index="Plate 4"
          sizes="(min-width: 1280px) 780px, (min-width: 1024px) 58vw, 100vw"
          alt="The Invoice Management System block, expanded: 156 records — accept 143, reject 3, pending 4, decide 6 — of which 134 carry no action, worth 2.97 crore, flowing into the return as filed once GSTR-3B goes in."
          caption="The Invoice Management System, valued. Inaction is deemed acceptance, so the 134 records carrying no action — ₹2.97 crore of them — flow into the return as filed unless somebody opens this screen."
        />
        </div>

        {/* The contents page, beside the plates rather than under them. No
            tick mark: these are not assertions, they are an index, and a mark
            against an index would be a mark that means nothing.

            It is sticky because the column is shorter than the plates beside
            it, and a two-column grid whose second column runs out re-creates
            exactly the dead paper the paper grid was fixed to remove. An index
            that stays put while the plates pass it is also what an index is
            for: a reader looking at the findings plate can see where findings
            sit in the whole product without scrolling away from it. */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start lg:pt-1">
          <dl className="border-t border-hairline">
            {SCREENS.map(([screen, answers]) => (
              <div key={screen} className="border-b border-hairline py-3">
                <dt className="wdth-set font-anek text-subhead font-semibold leading-tight text-agreed">
                  {screen}
                </dt>
                <dd className="rag-pretty opsz-prose mt-1 font-news text-ident leading-relaxed text-graphite">
                  {answers}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
