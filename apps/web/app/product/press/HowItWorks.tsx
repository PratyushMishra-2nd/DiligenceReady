/**
 * How it works, as four steps.
 *
 * Deliberately not three boxes with icons in a row, which is the default
 * shape of this section and reads as templated. These are numbered stages of
 * one pipeline, set as a ruled sequence, with the step number at display
 * scale in the margin: the same numbered-stub logic the rest of the page
 * uses, applied to a process.
 */

const STEPS = [
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

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-10 py-20">
      <h2 className="wdth-tight max-w-[18ch] font-anek text-opener font-bold text-agreed">
        What it actually does
      </h2>

      <ol className="mt-14 border-t border-hairline">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="grid gap-x-10 gap-y-3 border-b border-hairline py-8 sm:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[7rem_minmax(0,30ch)_minmax(0,1fr)]"
          >
            <p className="wdth-condensed font-anek text-[2.75rem] font-bold leading-none text-statute">
              {step.n}
            </p>
            <h3 className="wdth-set font-anek text-[1.5rem] font-semibold leading-tight text-agreed">
              {step.title}
            </h3>
            <p className="opsz-prose font-news text-prose text-graphite">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
