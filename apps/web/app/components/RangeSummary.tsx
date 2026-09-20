import Link from "next/link";

import type { RangeSummary as Range } from "../lib/api";
import {
  RULE_LABEL,
  inr,
  inrExact,
  inrShort,
  periodLabel,
  pct,
  severityBar,
  supplierOf,
} from "../lib/format";

/**
 * A span of months as one sheet.
 *
 * The single-month page answers "how was August". This answers the two
 * questions a month cannot: what the span comes to, and which month inside it
 * is the one to open. Both halves are on the page at once because a total
 * without its months is a number nobody can check, and months without a total
 * are a table a reader has to add up themselves — which is the moment a
 * figure on a screen becomes a figure in someone's head, and wrong.
 *
 * Every number here was computed by the engine. This file formats and nothing
 * else: no sums, no percentages, no averages. The coverage figure in the
 * totals row in particular is not the mean of the column above it — the
 * engine sums matched and total across the span and divides once, so a month
 * with three documents cannot outvote a month with three thousand — and a
 * mean taken here would quietly disagree with it.
 */
export function RangeSummary({
  range,
  companyId,
}: {
  range: Range;
  companyId: string;
}) {
  const { totals, months } = range;
  const gaps = months.filter((month) => !month.present);

  return (
    <section className="mt-3">
      <div className="grid gap-x-12 gap-y-8 border-y border-graphite-soft py-8 md:grid-cols-4">
        <Figure
          label="Input tax credit at risk"
          value={inrShort(totals.itc_at_risk)}
          exact={inrExact(totals.itc_at_risk)}
          note="Purchases with no GSTR-2B counterpart"
        />
        <Figure
          label="Value differs from 2B"
          value={inrShort(totals.itc_mismatch)}
          exact={inrExact(totals.itc_mismatch)}
          note="Booked and reported do not agree"
        />
        <Figure
          label="Bank against books"
          value={inrShort(totals.bank_variance)}
          exact={inrExact(totals.bank_variance)}
          note="Closing variance, summed across the span"
        />
        <Figure
          label="Open findings"
          value={String(totals.open_risks)}
          note={`${totals.high_risks} high · across ${totals.months_reconciled} reconciled ${
            totals.months_reconciled === 1 ? "month" : "months"
          }`}
        />
      </div>

      {/* A month the books never opened is not a zero, and a table that
          renders it as one says the client filed a clean nil return. It is
          said in words instead. */}
      {gaps.length > 0 && (
        <p className="mt-4 max-w-[70ch] text-ident text-graphite">
          {gaps.length === 1 ? "One month in this span has" : `${gaps.length} months in this span have`}{" "}
          no documents at all:{" "}
          <span className="text-graphite-soft">
            {gaps.map((month) => periodLabel(month.period, true)).join(", ")}
          </span>
          . Nothing was filed for {gaps.length === 1 ? "it" : "them"}, which is
          different from nothing being wrong.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-ident">
          <caption className="sr-only">
            Each month from {periodLabel(range.from)} to {periodLabel(range.to)}
          </caption>
          <thead>
            <tr className="border-b border-graphite-soft text-left font-mono text-stub uppercase tracking-[0.06em] text-graphite">
              <th scope="col" className="py-2 pr-4 font-normal">Month</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">2B coverage</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Bank coverage</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">ITC at risk</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Bank variance</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Open</th>
              <th scope="col" className="py-2 text-right font-normal">High</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((month) => (
              <tr
                key={month.period}
                className={`border-b border-hairline ${month.present ? "" : "text-graphite-soft"}`}
              >
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  <Link
                    href={`/app/companies/${companyId}?period=${month.period}`}
                    className="underline decoration-hairline underline-offset-4 hover:decoration-agreed hover:text-agreed"
                  >
                    {periodLabel(month.period)}
                  </Link>
                  {month.present && !month.gstr2b_generated && (
                    <span className="ml-2 text-graphite-soft">no 2B yet</span>
                  )}
                  {month.gstr2b_stale && (
                    <span className="ml-2 text-caution">2B stale</span>
                  )}
                </th>
                <td className="tabular py-2 pr-4 text-right">
                  {month.gst_total ? pct(month.gst_coverage_pct) : "—"}
                </td>
                <td className="tabular py-2 pr-4 text-right">
                  {month.bank_total ? pct(month.bank_coverage_pct) : "—"}
                </td>
                <td className="tabular py-2 pr-4 text-right">{inr(month.itc_at_risk)}</td>
                <td className="tabular py-2 pr-4 text-right">{inr(month.bank_variance)}</td>
                <td className="tabular py-2 pr-4 text-right">{month.open_risks || "—"}</td>
                <td className="tabular py-2 text-right">
                  {month.high_risks ? (
                    <span className="text-exposure">{month.high_risks}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-books font-medium">
              <th scope="row" className="py-2 pr-4 text-left">
                {totals.months} months
                <span className="ml-2 font-normal text-graphite-soft">
                  {totals.gst_matched} of {totals.gst_total} documents
                </span>
              </th>
              <td className="tabular py-2 pr-4 text-right">{pct(totals.gst_coverage_pct)}</td>
              <td className="tabular py-2 pr-4 text-right">{pct(totals.bank_coverage_pct)}</td>
              <td className="tabular py-2 pr-4 text-right">{inr(totals.itc_at_risk)}</td>
              <td className="tabular py-2 pr-4 text-right">{inr(totals.bank_variance)}</td>
              <td className="tabular py-2 pr-4 text-right">{totals.open_risks || "—"}</td>
              <td className="tabular py-2 text-right">
                {totals.high_risks ? (
                  <span className="text-exposure">{totals.high_risks}</span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <RangeFindings range={range} companyId={companyId} />
    </section>
  );
}

/**
 * The findings inside the span, newest month first.
 *
 * Deliberately not the single-month findings list. That one is a working
 * surface — filters, an evidence drawer, a decision on each row — and a
 * decision belongs to a month, taken with that month's 2B in front of you.
 * This is the index: what is there, where it is, and one click into the month
 * that owns it.
 */
function RangeFindings({ range, companyId }: { range: Range; companyId: string }) {
  const open = range.risks.filter((risk) => risk.status === "open");
  const shown = open.slice(0, 40);

  if (open.length === 0) {
    return (
      <p className="mt-10 max-w-[70ch] text-ident text-graphite">
        No open findings between {periodLabel(range.from)} and {periodLabel(range.to)}.
        {range.totals.months_reconciled === 0 &&
          " No month in this span has a generated GSTR-2B, so nothing has been reconciled yet."}
      </p>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="text-ident font-semibold text-books">
        Open findings across the span
      </h2>
      <p className="mt-1 text-ident text-graphite">
        {open.length} open{" "}
        {shown.length < open.length && (
          <span className="text-graphite-soft">
            · the {shown.length} largest are listed; open a month for all of its own
          </span>
        )}
      </p>

      <ul className="mt-4">
        {shown.map((risk) => (
          <li key={risk.risk_id} className="flex gap-3 border-b border-hairline py-2.5">
            <span
              aria-hidden
              className={`mt-0.5 shrink-0 self-stretch ${severityBar(risk.severity)}`}
            />
            <span className="sr-only">{risk.severity} severity</span>
            <Link
              href={`/app/companies/${companyId}?period=${risk.period}`}
              className="tabular w-[5.5rem] shrink-0 text-ident text-graphite underline decoration-hairline underline-offset-4 hover:decoration-agreed hover:text-agreed"
            >
              {periodLabel(risk.period, true)}
            </Link>
            <span className="w-[10rem] shrink-0 truncate text-ident text-graphite">
              {RULE_LABEL[risk.rule_code] ?? risk.rule_code}
            </span>
            <span className="min-w-0 flex-1 truncate text-ident">{supplierOf(risk)}</span>
            <span className="tabular shrink-0 text-ident">
              {risk.headline_amount ? inrShort(risk.headline_amount) : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({
  label,
  value,
  exact,
  note,
}: {
  label: string;
  value: string;
  exact?: string | null;
  note: string;
}) {
  return (
    <div>
      <h2 className="font-mono text-stub uppercase tracking-[0.06em] text-graphite">
        {label}
      </h2>
      <p className="tabular mt-2 font-anek text-[1.75rem] font-bold leading-none text-agreed">
        {value}
      </p>
      {exact && <p className="tabular mt-1 text-ident text-graphite-soft">{exact}</p>}
      <p className="mt-1.5 text-ident leading-relaxed text-graphite">{note}</p>
    </div>
  );
}
