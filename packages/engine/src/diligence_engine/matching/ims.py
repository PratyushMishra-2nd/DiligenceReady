"""IMS action intelligence — the loop that did not exist before October 2024.

The blueprint's revised core loop (§15): match the purchase register against
the IMS dashboard, compute the recommended action for every record, and let
the CA bulk-approve with evidence. Not "here are your mismatches" but:

    1,240 records: accept 1,187, reject 12, pending 41. Here is the evidence
    for each, and here are the 12 rejections that will raise your supplier's
    liability.

Four constraints from GSTN's advisory shape what may be recommended, and each
is enforced here rather than left to the interface:

**Pending is not always available.** It is prohibited on an original credit
note, on an upward amendment of a credit note whatever was done to the
original, on a downward amendment of a credit note whose original was
rejected, and on a downward amendment of an invoice or debit note whose
original was accepted and whose GSTR-3B is already filed. Offering it anyway
produces a portal error the user cannot interpret, so `pending_allowed` is
computed at ingestion and the recommendation never crosses it.

**Rejecting has a counterparty cost.** Rejecting a credit note raises the
supplier's liability in their next GSTR-3B, and the supplier can see the
action taken. Any recommendation to reject carries that warning with it.

**Saved is not filed.** A record reaches IMS when the supplier saves it and
counts only once they file. Recommending action on an unfiled record is
premature, so those are left alone with the reason recorded.

**Inaction is acceptance.** A record nobody touches flows into the return as
if accepted. That is the default state, and it is why this exists.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

DEFAULT_TOLERANCE = Decimal("1.00")


@dataclass
class ImsStats:
    total: int = 0
    by_recommendation: dict[str, int] = field(default_factory=dict)
    no_recommendation: int = 0
    raises_supplier_liability: int = 0
    deemed_accepted: int = 0

    def record(self, action: str | None) -> None:
        self.total += 1
        if action is None:
            self.no_recommendation += 1
        else:
            self.by_recommendation[action] = self.by_recommendation.get(action, 0) + 1


def _tolerance(conn: Connection) -> Decimal:
    row = conn.execute(
        text("select thresholds ->> 'tolerance_inr' as tol from rules where code = 'R10'")
    ).first()
    if row is None or row.tol is None:
        return DEFAULT_TOLERANCE
    return Decimal(str(row.tol))


def recommend(conn: Connection, company_id: uuid.UUID) -> ImsStats:
    """Compute a recommended action for every IMS record. Safe to rerun."""
    tolerance = _tolerance(conn)
    stats = ImsStats()

    rows = conn.execute(
        text(
            """
            -- DISTINCT ON, because the register legitimately books the
            -- same document twice — that is what R3 exists to find. Without
            -- it one IMS record fanned out into N rows: the counts in
            -- ImsStats exceeded the number of records on the dashboard, and
            -- the same id was updated twice with different recommendations,
            -- so which one survived depended on execution order.
            select distinct on (r.id)
                   r.id, r.doc_type, r.supplier_gstin, r.norm_invoice_no, r.total_value,
                   r.supplier_filed, r.pending_allowed, r.portal_status,
                   r.reject_raises_supplier_liability,
                   p.id as purchase_id, p.total_value as books_value, p.invoice_no,
                   -- A credit note is matched through the document it corrects,
                   -- never against a register row of its own.
                   orig.id as original_id, orig.invoice_no as original_invoice_no
            from ims_records r
            left join purchase_invoices p
                   on p.company_id = r.company_id
                  and p.supplier_gstin = r.supplier_gstin
                  and p.norm_invoice_no = r.norm_invoice_no
            left join purchase_invoices orig
                   on orig.company_id = r.company_id
                  and orig.supplier_gstin = r.supplier_gstin
                  and orig.norm_invoice_no = r.orig_norm_invoice_no
            where r.company_id = :cid
            -- Deterministic tie-break: the earliest booking of a duplicated
            -- document is the one the recommendation is made against.
            order by r.id, p.source_row nulls last, orig.source_row nulls last
            """
        ),
        {"cid": company_id},
    ).all()

    updates: list[dict] = []
    for row in rows:
        action, reason = _decide(row, tolerance)
        stats.record(action)
        if row.portal_status == "no_action":
            stats.deemed_accepted += 1
        if action == "reject" and row.reject_raises_supplier_liability:
            stats.raises_supplier_liability += 1

        updates.append(
            {
                "id": row.id,
                "action": action,
                "reason": reason,
                "matched": row.purchase_id,
            }
        )

    for start in range(0, len(updates), 500):
        conn.execute(
            text(
                "update ims_records set recommended_action = :action, "
                "  recommendation_reason = :reason, matched_invoice_id = :matched "
                "where id = :id"
            ),
            updates[start : start + 500],
        )

    return stats


def _decide(row, tolerance: Decimal) -> tuple[str | None, str]:
    """The recommendation, and the sentence explaining it.

    Order matters: the prohibitions are checked before the preferences, so a
    recommendation the portal would refuse can never be produced.
    """
    if not row.supplier_filed:
        return None, (
            "The supplier has saved this record but not filed it. It is visible on the "
            "dashboard and does not yet count towards 2B, so there is nothing to action."
        )

    # A credit note is resolved through the document it corrects. It never has
    # a purchase-register row of its own, so the generic no-counterpart branch
    # below must not see one — it would recommend rejecting every legitimate
    # purchase return in the file, and a reject on a credit note raises the
    # supplier's liability where the supplier can see it.
    if row.doc_type == "credit_note":
        if row.original_id is not None:
            return "accept", (
                f"Credit note against {row.original_invoice_no}, which is booked in the "
                "purchase register. This is a purchase return; accepting it reduces the "
                "claim, which is the correct treatment."
            )
        return None, (
            "Credit note against a document the purchase register does not contain. "
            "Either the original purchase is unbooked or the supplier raised it against "
            "the wrong party — and this needs a person, because rejecting a credit note "
            "raises the supplier's liability in their next GSTR-3B where they can see "
            "it, and pending is not available on an original credit note."
        )

    if row.purchase_id is None:
        return "reject", (
            "On the IMS dashboard with no counterpart in the purchase register. Either "
            "the purchase is unbooked or the supplier filed against the wrong GSTIN. "
            "Taking no action accepts it into the return."
        )

    difference = abs(Decimal(row.total_value) - Decimal(row.books_value))
    if difference > tolerance:
        if row.pending_allowed:
            return "pending", (
                f"Document value differs from the register by {difference:.2f}, beyond the "
                f"{tolerance:.2f} tolerance. Hold it pending while the supplier is asked to "
                "amend; pending records may be availed later, but never beyond the "
                "Sec 16(4) limit."
            )
        return "reject", (
            f"Document value differs from the register by {difference:.2f}, and pending is "
            "not available on this record type. Rejecting it raises the supplier's "
            "liability, so confirm before acting."
        )

    if row.doc_type == "credit_note":
        return "accept", (
            "Credit note matched to a register entry within tolerance. Accepting reduces "
            "the claim, which is the correct treatment."
        )

    return "accept", (
        "Matched to a purchase-register entry within tolerance on value. Accepting is the "
        "same outcome inaction would produce, with the difference that it is reviewed."
    )
