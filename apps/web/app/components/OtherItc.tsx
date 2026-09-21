import type { OtherItcSummary } from "../lib/api";
import { inr, inrExact, inrShort } from "../lib/format";
import { Disclosure } from "./Disclosure";

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
 *
 * It is context rather than work, so it is collapsed by default — with its
 * total in the summary, because a section that closes to a title alone hides
 * the one figure someone would have opened it to check.
 *
 * That summary figure is `claimable_tax` from the engine, and it is signed: a
 * credit note subtracts. This component used to sum `groups[].tax` itself,
 * which added credit notes as though they were credit and overstated the
 * total by twice their tax — the exact error the paragraph above says the
 * section exists to prevent, reintroduced in the one line most readers see,
 * because the section is closed by default.
 */
export function OtherItc({ other }: { other: OtherItcSummary }) {
  if (other.groups.length === 0) return null;

  const adjustment = Number(other.net_note_adjustment);

  return (
    <Disclosure
      title="Other credit in this 2B"
      headline={
        <p className="fig text-caption-13 text-ink-muted">
          {other.groups.length} section{other.groups.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium text-ink">{inrShort(other.claimable_tax)}</span>
        </p>
      }
    >
      <p className="max-w-[70ch] text-copy-17 leading-relaxed text-ink-muted">
        Sections of the statement that carry credit without carrying a document the
        purchase register would hold. They are excluded from the match figures above
        deliberately, and shown here so nothing in the statement goes unaccounted for.
      </p>

      <dl className="mt-5 space-y-2.5">
        {other.groups.map((group) => (
          <div
            key={`${group.section}-${group.note_type ?? ""}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-2 last:border-0"
          >
            <dt className="text-copy-17">
              <span className="font-mono text-caption-13 text-ink-subtle">{group.section}</span>
              <span className="ml-3">{group.label}</span>
            </dt>
            <dd className="fig flex shrink-0 items-baseline gap-6 text-caption-13">
              <span className="text-ink-subtle">
                {group.documents} doc{group.documents === 1 ? "" : "s"}
              </span>
              <span className="w-32 text-right">
                <span className="block font-medium">{inrShort(group.tax)}</span>
                {inrExact(group.tax) && (
                  <span className="block text-caption-13 text-ink-subtle">
                    {inrExact(group.tax)}
                  </span>
                )}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {adjustment !== 0 && (
        <p className="fig mt-4 text-copy-17">
          Net effect of notes on the claim:{" "}
          <span className={adjustment < 0 ? "font-medium text-exposure" : "font-medium"}>
            {inr(other.net_note_adjustment)}
          </span>
          <span className="ml-2 text-caption-13 text-ink-muted">
            {adjustment < 0
              ? "credit notes reduce what can be claimed"
              : "debit notes increase it"}
          </span>
        </p>
      )}
    </Disclosure>
  );
}
