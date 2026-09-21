/**
 * How it works, as four steps.
 *
 * Deliberately not three boxes with icons in a row, which is the default
 * shape of this section and reads as templated. These are numbered stages of
 * one pipeline, set as a ruled sequence, with the step number at display
 * scale in the margin: the same numbered-stub logic the rest of the page
 * uses, applied to a process.
 */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Read what the firm already has",
    body: "A Tally XML gateway on port 9000, the GSTR-2B JSON or Excel any taxpayer downloads, the Invoice Management System record, and a bank statement CSV. Nothing is written back to a client's books.",
  },
  {
    n: "02",
    title: "Match across the three records",
    body: "Invoice numbers are written by hand in Tally and machine-generated on the portal, so the same document appears two different ways. The matcher reduces both to the part they agree on before comparing supplier, value and period.",
  },
  {
    n: "03",
    title: "Raise what does not reconcile",
    body: "Every exception is a row in a match table and a figure computed in SQL: credit with no counterpart, amounts that disagree, invoices booked twice, deposits nobody identified. Each one carries the statutory deadline that governs it.",
  },
  {
    n: "04",
    title: "Keep the evidence",
    body: "Click any amount and land on the line of the original file that produced it. The month exports as one document a lender can take as read.",
  },
];

import { Opener } from "./Sheet";

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 py-section md:py-section-md lg:py-section-lg">
      {/* The list below is on the paper grid and this heading was not, which
          left it 80px outside the column every other opener starts in. */}
      <div className="lg:pl-[268px]">
        <Opener className="max-w-pull">
          What it actually does
        </Opener>
      </div>

      <ol className="mt-block border-t border-hairline">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="reveal grid gap-x-block gap-y-3 border-b border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)]"
          >
            {/* The number hangs in the tick gutter, where the mark goes on
                every other section, because a numbered stage is what this
                section's assertions are indexed by. */}
            <p className=" font-sans text-head-2 font-semibold leading-none text-exposure">
              {step.n}
            </p>
            <div className="min-w-0">
              <h3 className=" font-sans text-head-3 font-semibold leading-tight text-ink">
                {step.title}
              </h3>
              <p className="rag-pretty mt-2 max-w-sheet font-sans text-copy-17 text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
