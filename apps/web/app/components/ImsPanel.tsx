import type { ImsSummary } from "../lib/api";
import { inr, inrShort } from "../lib/format";
import { Disclosure } from "./Disclosure";

/**
 * The Invoice Management System, reduced to the decision in front of the CA.
 *
 * IMS went live in October 2024, and the thing that matters about it is not
 * the dashboard — it is that **inaction is acceptance**. Whatever a supplier
 * filed flows into the client's return unreviewed unless someone looks. For
 * one company with thirty invoices that is fine. For a firm carrying fifty
 * clients it is the entire problem, on a portal that shows a thousand rows at
 * a time.
 *
 * So this is not a list of mismatches. It is a count, a split, and the two
 * warnings that stop a CA making an expensive mistake: how many rejections
 * will be visible to the supplier, and how many records the portal will not
 * let them hold pending.
 *
 * The count that decides whether to open it — how many records nobody has
 * actioned — is in the summary, so the closed state still answers the
 * question.
 */
export function ImsPanel({ ims }: { ims: ImsSummary }) {
  const reviewed = ims.total - ims.deemed_accepted;

  return (
    <Disclosure
      title="Invoice Management System"
      headline={
        <p className="tabular text-micro text-ink-soft">
          {reviewed} of {ims.total} actioned ·{" "}
          <span className={ims.deemed_accepted > 0 ? "font-medium text-exposure" : ""}>
            {ims.deemed_accepted} flowing through unreviewed
          </span>
        </p>
      }
    >
      <p className="tabular text-figure font-medium">
        {ims.total} records: <span className="text-reconciled">accept {ims.accept}</span>,{" "}
        <span className="text-exposure">reject {ims.reject}</span>, pending {ims.pending}
        {ims.decide > 0 && <>, decide {ims.decide}</>}
      </p>

      <p className="mt-3 max-w-[70ch] text-body leading-relaxed text-ink-soft">
        <span className="tabular font-medium text-ink">{ims.deemed_accepted}</span> of them
        carry no action, worth{" "}
        <span className="tabular font-medium text-ink" title={inr(ims.deemed_accepted_value)}>
          {inrShort(ims.deemed_accepted_value)}
        </span>
        . Inaction is deemed acceptance, so those flow into the return as filed once
        GSTR-3B goes in — after which no action is possible.
      </p>

      {(ims.reject_raises_liability > 0 || ims.decide > 0 || ims.not_filed > 0) && (
        <ul className="mt-4 space-y-1.5 text-data">
          {ims.reject_raises_liability > 0 && (
            <li className="flex gap-3">
              <span className="tabular w-7 shrink-0 text-right font-medium text-exposure">
                {ims.reject_raises_liability}
              </span>
              <span className="text-ink-soft">
                of the rejections raise the supplier&rsquo;s liability in their next
                GSTR-3B, and the supplier can see the action. Confirm before acting.
              </span>
            </li>
          )}
          {ims.decide > 0 && (
            <li className="flex gap-3">
              <span className="tabular w-7 shrink-0 text-right font-medium">
                {ims.decide}
              </span>
              <span className="text-ink-soft">
                need a person: credit notes against documents the register does not
                contain, where pending is barred and rejecting is visible to the supplier.
              </span>
            </li>
          )}
          {ims.not_filed > 0 && (
            <li className="flex gap-3">
              <span className="tabular w-7 shrink-0 text-right font-medium">
                {ims.not_filed}
              </span>
              <span className="text-ink-soft">
                are saved but not filed by the supplier. Visible on the dashboard, not yet
                counted in 2B, and nothing to action until they file.
              </span>
            </li>
          )}
        </ul>
      )}
    </Disclosure>
  );
}
