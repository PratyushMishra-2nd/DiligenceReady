/**
 * What the product does, and what it costs.
 *
 * One schedule: the five things the engine does for a firm every month, each
 * with the sentence that says what it means in practice, and the price under
 * the heading beside it.
 */

const STANDING: { item: string; note: string }[] = [
  {
    item: "Reconciliation engine, GST and bank",
    note: "Books against GSTR-2B against the bank, every period, with the exceptions raised and priced.",
  },
  {
    item: "Evidence to the source file line",
    note: "Every figure opens on the row of the original export that produced it and the SQL that summed it.",
  },
  {
    item: "Firm-level access control",
    note: "Every account belongs to one firm, and every query the engine answers is scoped to the firm on the session.",
  },
  {
    item: "Invoice Management System, read",
    note: "The IMS record is ingested and what sits unactioned is valued in rupees against the return.",
  },
  {
    item: "The whole month, printable",
    note: "A period exports as one document, typeset to be filed rather than screenshotted.",
  },
];

import { Opener, slipFor } from "./Sheet";

export function Standing() {
  return (
    // The tick gutter is 2.5rem and the gap after it is another 2.5rem, so a
    // section that is not on the paper grid begins 80px to the left of every
    // section that is. This one and the screens section were not, which put
    // three consecutive sections on two different left edges.
    <section className="py-14 lg:pl-20">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Opener slip={slipFor("standing")} className="optical-cap max-w-[18ch]">
            What it does, monthly
          </Opener>
          <p className="rag-pretty opsz-deck mt-7 max-w-[40ch] font-news text-[1.4rem] sm:text-deck text-agreed">
            Working software, measured against an answer key, running on twelve months of
            books right now.
          </p>
          <p className="rag-pretty opsz-prose mt-6 max-w-[48ch] font-news text-prose text-graphite">
            Five things, every period, for every client on the roster — and every figure any
            of them produces opens on the row of the file it came from.
          </p>
        </div>

        <dl className="border-t border-hairline lg:mt-4">
          {STANDING.map(({ item, note }) => (
            <div key={item} className="border-b border-hairline py-3">
              <dt className="wdth-set font-anek text-subhead font-semibold leading-tight text-agreed">
                {item}
              </dt>
              <dd className="rag-pretty opsz-prose mt-1 font-news text-ident leading-relaxed text-graphite">
                {note}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
