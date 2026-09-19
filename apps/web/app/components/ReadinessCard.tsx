import type { Readiness } from "../lib/api";
import { inr, inrShort, pct } from "../lib/format";

/**
 * Coverage and exposure are kept in separate columns with different type
 * treatments, deliberately (§13). They have opposite polarity — 96% reconciled
 * is good news, ₹24 lakh unexplained is not — and putting them on one visual
 * scale invites exactly the misreading a CA cannot afford. Coverage is quiet
 * and grey; exposure is the only place vermillion appears.
 */
export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  return (
    <section className="grid gap-x-12 gap-y-8 border-y border-rule-strong py-8 md:grid-cols-2">
      <div>
        <h2 className="text-micro font-semibold text-ink-soft">Reconciled</h2>
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

      <div className="md:border-l md:border-rule md:pl-12">
        <h2 className="text-micro font-semibold text-exposure">Exposed</h2>
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
  return (
    <div className="flex items-baseline justify-between gap-6">
      <div className="max-w-[34ch]">
        <dt className="text-sm">{label}</dt>
        <dd className="tabular mt-0.5 text-micro text-ink-faint">{detail}</dd>
      </div>
      <dd className="tabular shrink-0 text-2xl font-medium tracking-tight">
        {percent}
        <span className="text-base text-ink-faint">%</span>
      </dd>
    </div>
  );
}

function ExposureRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="max-w-[34ch] text-sm">{label}</dt>
      <dd
        className="tabular shrink-0 text-2xl font-medium tracking-tight text-exposure"
        title={inr(amount)}
      >
        {inrShort(amount)}
      </dd>
    </div>
  );
}

function PercentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="max-w-[34ch] text-sm">{label}</dt>
      <dd className="tabular shrink-0 text-2xl font-medium tracking-tight text-exposure">
        {pct(value)}
      </dd>
    </div>
  );
}
