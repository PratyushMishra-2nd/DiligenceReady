import { periodLabel } from "../lib/format";
import { Disclosure } from "./Disclosure";

/**
 * The month-eighteen payoff, shown as what it is: not built yet.
 *
 * §13's close points at this control and says "labelled next, not faked".
 * The thesis is that after eighteen months of reconciled, evidence-linked
 * history a lender-ready package falls out in a day rather than six weeks —
 * and the honest way to show that today is a disabled control that says how
 * many months of history actually exist, rather than a button that produces
 * a PDF nobody has verified.
 *
 * It is also the strongest thing on the screen for the moat argument: a
 * competitor can copy the engine and cannot copy the history.
 *
 * It sits last on the page and closed, because a control that by design never
 * works should not stand between a CA and the findings they came for.
 */
export function LenderPackage({
  periodsReconciled,
  earliest,
  latest,
}: {
  periodsReconciled: number;
  earliest: string;
  latest: string;
}) {
  return (
    <Disclosure
      title="Lender-ready package"
      headline={
        <p className="tabular text-ident text-graphite">
          <span className="font-medium text-agreed">{periodsReconciled} months</span> of
          reconciled history · not built yet
        </p>
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <p className="max-w-[60ch] text-prose leading-relaxed text-graphite">
          <span className="tabular font-medium text-agreed">{periodsReconciled} months</span>{" "}
          of reconciled history so far, {periodLabel(earliest)} to {periodLabel(latest)},
          every figure linked to the file line behind it. At eighteen months this becomes a
          diligence pack a lender can take as read, generated from history that already
          exists rather than assembled in six weeks of scrambling.
        </p>

        <button
          type="button"
          disabled
          title="Not built yet. Shown because the history it would be generated from is real."
          className="no-print shrink-0 cursor-not-allowed border border-hairline bg-stock px-4 py-2 text-ident text-graphite-soft"
        >
          Generate lender-ready package
        </button>
      </div>

      <p className="mt-3 text-ident text-graphite-soft">
        Deliberately inactive. The reconciled history behind it is real; the export is not
        written, and a button that produced an unverified pack would be worse than none.
      </p>
    </Disclosure>
  );
}
