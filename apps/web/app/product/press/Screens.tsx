/**
 * What you can do in it, screen by screen.
 *
 * A stranger who has understood the pipeline still does not know what they
 * are buying, so this names the actual surfaces and what each one answers.
 * Set as a schedule with leader rules rather than as feature cards: the
 * question is the content, and a card would put a border round it and add
 * nothing.
 */

const SCREENS: [string, string, string][] = [
  ["/", "Firm dashboard", "Which of my clients needs attention this month, and how much is on the line for each"],
  ["/companies/[id]", "Readiness", "How much of the purchase register reconciles against GSTR-2B and the bank, and what does not"],
  ["/companies/[id]", "Findings", "Every exception the engine raised, by severity and by rupee value, each with its calculation"],
  ["/companies/[id]", "Evidence", "The original file, the row inside it, and the match that produced the figure"],
  ["/companies/[id]", "IMS decisions", "Accept, reject or leave pending, and what leaving it pending is worth in rupees"],
  ["/companies/[id]", "Ask the ledger", "A question in English, answered from the engine's own aggregates, with the queries shown"],
  ["/companies/[id]", "Upload", "Drop a Tally, GSTR-2B or bank export in and the same pipeline reads it"],
  ["/companies/[id]", "Lender package", "The whole month as one printable document"],
];

import { Opener, Reference } from "./Sheet";

export function Screens() {
  return (
    <section className="py-20">
      <Opener slip={0.72} className="optical-cap max-w-[20ch]">
        Eight screens, <span className="whitespace-nowrap">one question each</span>
      </Opener>

      <dl className="mt-12 border-t border-hairline">
        {SCREENS.map(([route, screen, answers]) => (
          <div
            key={screen}
            className="grid gap-x-10 gap-y-1 border-b border-hairline py-4 lg:grid-cols-paper"
          >
            {/* The gutter carries nothing here on purpose: these are not
                assertions, they are a contents page, and a mark against a
                contents page would be a mark that means nothing. */}
            <span aria-hidden className="hidden lg:block" />
            <div className="min-w-0">
              <dt className="wdth-set font-anek text-[1.125rem] font-semibold text-agreed">
                {screen}
              </dt>
              <dd className="rag-pretty opsz-prose mt-1 font-news text-prose text-graphite">
                {answers}
              </dd>
            </div>
            <Reference>{route}</Reference>
          </div>
        ))}
      </dl>
    </section>
  );
}
