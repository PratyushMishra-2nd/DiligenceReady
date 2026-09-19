import type { OtherItcSummary } from "../lib/api";
import { inr, inrShort } from "../lib/format";

/**
 * The GSTR-2B sections the purchase register was never going to match.
 *
 * The matcher excludes them on purpose — a credit note corrects an earlier
 * document rather than being one, ISD credit is distributed by a head office,
 * imports are keyed on a bill of entry with no supplier at all. Feeding those
 * into a register comparison would manufacture orphans and push the coverage
 * figure down for no reason.
 *
 * Excluded is not the same as hidden. A credit note reduces the claim, and a
 * reconciliation screen that silently dropped it would overstate the credit
 * available — which is the one direction of error that costs a client money
 * at assessment rather than just time.
 */
export function OtherItc({ other }: { other: OtherItcSummary }) {
  if (other.groups.length === 0) return null;

  const adjustment = Number(other.net_note_adjustment);

  return (
    <section className="border-b border-rule py-8">
      <h2 className="text-sm font-semibold">Other credit in this 2B</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
        Sections of the statement that carry credit without carrying a document the
        purchase register would hold. They are excluded from the match figures above
        deliberately, and shown here so nothing in the statement goes unaccounted for.
      </p>

      <dl className="mt-5 space-y-2.5">
        {other.groups.map((group) => (
          <div
            key={`${group.section}-${group.note_type ?? ""}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule/60 pb-2 last:border-0"
          >
            <dt className="text-sm">
              <span className="font-mono text-micro text-ink-faint">{group.section}</span>
              <span className="ml-3">{group.label}</span>
            </dt>
            <dd className="tabular flex shrink-0 items-baseline gap-6 text-sm">
              <span className="text-ink-faint">
                {group.documents} doc{group.documents === 1 ? "" : "s"}
              </span>
              <span className="w-28 text-right font-medium" title={inr(group.tax)}>
                {inrShort(group.tax)}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {adjustment !== 0 && (
        <p className="tabular mt-4 text-sm">
          Net effect of notes on the claim:{" "}
          <span className={adjustment < 0 ? "font-medium text-exposure" : "font-medium"}>
            {inr(other.net_note_adjustment)}
          </span>
          <span className="ml-2 text-micro text-ink-soft">
            {adjustment < 0
              ? "credit notes reduce what can be claimed"
              : "debit notes increase it"}
          </span>
        </p>
      )}
    </section>
  );
}
