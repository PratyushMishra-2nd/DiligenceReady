/**
 * What you can do in it, screen by screen.
 *
 * A stranger who has understood the pipeline still does not know what they
 * are buying, so this names the actual surfaces and what each one answers.
 * Set as a schedule with leader rules rather than as feature cards: the
 * question is the content, and a card would put a border round it and add
 * nothing.
 */

const SCREENS = [
  ["Firm dashboard", "Which of my clients needs attention this month, and how much is on the line for each"],
  ["Readiness", "How much of the purchase register reconciles against GSTR-2B and the bank, and what does not"],
  ["Findings", "Every exception the engine raised, by severity and by rupee value, each with its calculation"],
  ["Evidence", "The original file, the row inside it, and the match that produced the figure"],
  ["IMS decisions", "Accept, reject or leave pending, and what leaving it pending is worth in rupees"],
  ["Ask the ledger", "A question in English, answered from the engine's own aggregates, with the queries shown"],
  ["Upload", "Drop a Tally, GSTR-2B or bank export in and the same pipeline reads it"],
  ["Lender package", "The whole month as one printable document"],
];

export function Screens() {
  return (
    <section className="py-20">
      <h2 className="wdth-tight max-w-[20ch] font-anek text-opener font-bold text-agreed">
        Eight screens, one question each
      </h2>

      <dl className="mt-12 border-t border-hairline">
        {SCREENS.map(([screen, answers]) => (
          <div
            key={screen}
            className="grid gap-x-8 gap-y-1 border-b border-hairline py-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
          >
            <dt className="wdth-set font-anek text-[1.125rem] font-semibold text-agreed">
              {screen}
            </dt>
            <dd className="opsz-prose font-news text-prose text-graphite">{answers}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
