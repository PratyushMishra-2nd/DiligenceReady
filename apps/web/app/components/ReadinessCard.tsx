import type { Readiness } from "../lib/api";
import { inrExact, inrShort, pct } from "../lib/format";

/**
 * The two inks, doing the job the palette was built for.
 *
 * This screen is the one place in the product where what the books say and
 * what the statute says sit side by side, so it is where the two-ink system
 * either means something or is decoration. Reconciled is now printed in
 * `books` indigo and Exposed in `statute` vermillion, and the near-black
 * everything else is set in is visibly the product of the two, because both
 * parents are on the screen beside it.
 *
 * Exposure is also ranked rather than flat. Five figures in vermillion at
 * five different magnitudes is five alarms with no order between them, which
 * is no alarm: the eye cannot tell which one to pick up the phone about. The
 * two that carry rupees keep the ink. The percentages are real findings and
 * keep the vermillion rule in the margin, but their figures are set in
 * `agreed`, because a concentration ratio is a fact about the business and
 * not money with a deadline attached.
 *
 * Coverage and exposure are kept in separate columns with different type
 * treatments, deliberately (§13). They have opposite polarity — 96% reconciled
 * is good news, ₹24 lakh unexplained is not — and putting them on one visual
 * scale invites exactly the misreading a CA cannot afford.
 *
 * That intent used to be carried by hue alone: the two figures were the same
 * size and the same weight, and only one of them was vermillion. Under
 * protanopia #9E2B25 collapses toward ink, so for that reader the distinction
 * did not exist. It is now carried by form as well — coverage is light,
 * grey and proportional, with a rule under it showing the fraction; exposure
 * is semibold, vermillion, and sits behind a bar. Either channel alone is
 * enough to tell them apart, and both survive a monochrome print.
 */
export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  return (
    <section className="grid gap-x-12 gap-y-8 border-y border-graphite-soft py-8 md:grid-cols-2">
      <div>
        <h2 className="text-ident font-semibold text-books">Reconciled</h2>
        <dl className="mt-4 space-y-4">
          <CoverageRow
            label="Purchase register against GSTR-2B"
            percent={readiness.gst_coverage_pct}
            detail={`${readiness.gst_matched} of ${readiness.gst_total} documents matched`}
          />
          <CoverageRow
            label="Bank statement against vouchers"
            percent={readiness.bank_coverage_pct}
            detail={`${readiness.bank_matched} of ${readiness.bank_total} lines matched`}
          />
        </dl>
      </div>

      <div className="md:border-l md:border-hairline md:pl-12">
        <h2 className="text-ident font-semibold text-statute">Exposed</h2>
        <dl className="mt-4 space-y-4">
          <ExposureRow
            label="Input tax credit with no 2B counterpart"
            amount={readiness.itc_at_risk}
          />
          <ExposureRow label="Bank and books variance" amount={readiness.bank_variance} />
          {readiness.itc_reversal_37a !== "0.00" && (
            <ExposureRow
              label="Rule 37A reversal, reported by GSTN"
              amount={readiness.itc_reversal_37a}
            />
          )}
          {readiness.concentration_pct && (
            <PercentRow
              label="Revenue with the top three customers"
              value={readiness.concentration_pct}
            />
          )}
          {readiness.receivables_aged_pct && (
            <PercentRow
              label="Receivables past 90 days"
              value={readiness.receivables_aged_pct}
            />
          )}
        </dl>
      </div>
    </section>
  );
}

function CoverageRow({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: string;
  detail: string;
}) {
  const number = Number(percent);
  const width = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
  return (
    <div className="flex items-baseline justify-between gap-6">
      <div className="max-w-[34ch]">
        <dt className="text-prose">{label}</dt>
        <dd className="tabular mt-0.5 text-ident text-graphite-soft">{detail}</dd>
      </div>
      <dd className="shrink-0 text-right">
        <span className="tabular text-amount font-normal text-books">
          {percent}
          <span className="text-prose text-books/70">%</span>
        </span>
        {/* Proportional, so a column of them is comparable without reading the
            digits. Drawn in ink: coverage is progress, and the vermillion in
            this product means money at statutory risk and nothing else. */}
        <span aria-hidden className="mt-1.5 block h-[3px] w-14 bg-hairline">
          {/* The matched fraction, in the ink of the record it was matched
              against. The unmatched remainder is left as paper. */}
          <span className="block h-[3px] bg-books" style={{ width: `${width}%` }} />
        </span>
      </dd>
    </div>
  );
}

function ExposureRow({ label, amount }: { label: string; amount: string }) {
  // The rounded figure is the derived one. Keeping the exact rupee in a
  // `title` attribute put the source of truth somewhere a touch user and a
  // screen reader could not reach it — and where the figure is already exact,
  // there is nothing to print underneath it.
  const exact = inrExact(amount);
  return (
    <div className="flex items-baseline justify-between gap-6 border-l-2 border-statute pl-3">
      <dt className="max-w-[34ch] text-prose">{label}</dt>
      <dd className="shrink-0 text-right">
        <span className="tabular block text-amount font-semibold text-statute">
          {inrShort(amount)}
        </span>
        {exact && (
          <span className="tabular mt-0.5 block text-ident text-graphite-soft">{exact}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * An exposure that is a ratio rather than an amount.
 *
 * It keeps the vermillion rule in the margin, because it is a finding and
 * belongs to this column. Its figure is set in `agreed`, because vermillion
 * in this product means money at statutory risk and a concentration
 * percentage is not that. Holding the distinction is what stops the column
 * from reading as five identical alarms.
 */
function PercentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-l-2 border-statute pl-3">
      <dt className="max-w-[34ch] text-prose">{label}</dt>
      <dd className="tabular shrink-0 text-amount font-semibold text-agreed">
        {pct(value)}
      </dd>
    </div>
  );
}
