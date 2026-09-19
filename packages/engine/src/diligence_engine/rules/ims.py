"""Domain D — the Invoice Management System, plus Sec 17(5) blocked credit.

R9   IMS_ACTION_REQUIRED    records nobody has looked at, being deemed accepted
R10  IMS_RECOMMEND_REJECT   documents with nothing behind them in the books
R11  GSTR2B_STALE           an action after the 14th, so 2B must be recomputed
R12  FILING_CHAIN_BLOCKED   the prior period's GSTR-3B is unfiled
R13  BLOCKED_CREDIT_17_5    credit that is ineligible however well it reconciles

These are disabled in the rule registry by default. §15 names a practising CA
reviewing the GST rule set as the one outstanding dependency this project has,
and IMS is where the statutory detail is thickest — the Pending prohibitions
alone have four cases. The code is written, tested and switched off; enabling
it is `diligence rule enable R9`, not a change here.

R12 is implemented and silent on the seeded data, deliberately. Its trigger is
a period whose prior GSTR-3B is unfiled, and the generator produces a complete
filing chain because a 2B exists for every period. Faking the flag to make the
rule fire would be a lie told to a demo.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.normalise import format_inr, shift_period
from diligence_engine.rules.base import Evidence, RiskDraft, RuleSpec, document_key

ZERO = Decimal("0.00")


def rule_r9_action_required(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """Records the client has not looked at, which the portal will accept for them.

    The advisory insists IMS adds no compliance burden because inaction equals
    deemed acceptance. For one company with thirty invoices, true. For a firm
    carrying fifty clients, deemed acceptance *is* the burden.
    """
    row = conn.execute(
        text(
            """
            select count(*) as records,
                   coalesce(sum(total_value), 0) as value,
                   count(*) filter (where recommended_action = 'reject') as would_reject,
                   count(*) filter (where recommended_action = 'pending') as would_pend,
                   count(*) filter (where recommended_action = 'accept') as would_accept
            from ims_records
            where company_id = :cid and period = :period and deemed_accepted
            """
        ),
        {"cid": company_id, "period": period},
    ).one()

    if row.records == 0:
        return []

    needs_review = row.would_reject + row.would_pend
    severity = "high" if row.would_reject else "medium" if needs_review else "low"

    return [
        RiskDraft(
            rule_code="R9",
            risk_key="R9:deemed_accepted",
            severity=severity,
            headline_amount=row.value,
            metrics={
                "records_awaiting_action": row.records,
                "value": row.value,
                "recommended_accept": row.would_accept,
                "recommended_reject": row.would_reject,
                "recommended_pending": row.would_pend,
                "deadline": "No action is possible once GSTR-3B is filed for the month.",
            },
            calculation=(
                f"{row.records} records worth {format_inr(row.value)} carry no action. "
                f"Recommended: accept {row.would_accept}, reject {row.would_reject}, "
                f"pending {row.would_pend}"
            ),
            rule_text=(
                "Records on the IMS dashboard with no action taken. Inaction is deemed "
                "acceptance, so these flow into the return unreviewed once GSTR-3B is "
                "filed, after which no action is possible."
            ),
        )
    ]


def rule_r10_recommend_reject(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    rows = conn.execute(
        text(
            """
            select r.id, r.supplier_gstin, r.invoice_no, r.norm_invoice_no, r.doc_type,
                   r.invoice_date, r.total_value, r.recommendation_reason,
                   r.recommended_action, r.orig_norm_invoice_no,
                   r.reject_raises_supplier_liability, r.pending_allowed,
                   r.source_row, r.source_document_id, d.filename,
                   coalesce(p.canonical_name, r.supplier_gstin) as supplier_name
            from ims_records r
            join documents d on d.id = r.source_document_id
            left join parties p on p.company_id = r.company_id
                               and p.gstin = r.supplier_gstin
            where r.company_id = :cid and r.period = :period
              and (
                    r.recommended_action = 'reject'
                    -- A credit note whose original is not in the books gets no
                    -- automatic recommendation, because the only two options
                    -- are barred or commercially visible. It is still a
                    -- finding: it needs a person, and it needs one before
                    -- GSTR-3B is filed and the window shuts.
                    or (
                        r.doc_type = 'credit_note'
                        and r.recommended_action is null
                        and r.supplier_filed
                    )
              )
            order by r.total_value desc
            """
        ),
        {"cid": company_id, "period": period},
    ).all()

    return [
        RiskDraft(
            rule_code="R10",
            risk_key=document_key("R10", row.supplier_gstin, row.norm_invoice_no, row.id),
            severity="high",
            headline_amount=row.total_value,
            metrics={
                "supplier_gstin": row.supplier_gstin,
                "supplier_name": row.supplier_name,
                "invoice_no": row.invoice_no,
                "doc_type": row.doc_type,
                "invoice_date": row.invoice_date,
                "corrects_document": row.orig_norm_invoice_no,
                "recommended_action": row.recommended_action or "decide",
                "reason": row.recommendation_reason,
                "raises_supplier_liability": row.reject_raises_supplier_liability,
                "pending_available": row.pending_allowed,
            },
            calculation=(
                f"{format_inr(row.total_value)} on the IMS dashboard, recommended action "
                f"{row.recommended_action or 'needs a decision'}"
            ),
            rule_text=_r10_text(row),
            evidence=[
                Evidence(
                    record_type="ims_record",
                    record_id=row.id,
                    document_id=row.source_document_id,
                    source_row=row.source_row,
                    note=f"{row.filename} record {row.source_row}: {row.invoice_no}",
                )
            ],
        )
        for row in rows
    ]


def _r10_text(row) -> str:
    """What the CA is being asked to do, and what it costs them to do it."""
    if row.recommended_action is None:
        return (
            "Credit note against a document that is not in the purchase register. "
            "No action is recommended automatically: pending is barred on an original "
            "credit note, and rejecting raises the supplier's liability in their next "
            "GSTR-3B where they can see it. Decide before GSTR-3B is filed."
        )
    if row.reject_raises_supplier_liability:
        return (
            "Recommended reject. This raises the supplier's liability in their next "
            "GSTR-3B and the supplier can see the action taken, so confirm with them "
            "before acting."
        )
    return (
        "Recommended reject. Taking no action instead accepts it into the return, "
        "because inaction is deemed acceptance."
    )


def rule_r11_gstr2b_stale(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """Any action after the 14th makes recomputing 2B mandatory.

    Until that recompute happens every downstream figure for the period is
    drawn from a superseded statement, so this blocks rather than informs.
    """
    trigger_day = int(spec.thresholds.get("trigger_day_of_month", 14))
    row = conn.execute(
        text(
            """
            select count(*) as actions, max(actioned_at) as latest
            from ims_records
            where company_id = :cid and period = :period
              and actioned_at is not null
              and extract(day from actioned_at) > :day
            """
        ),
        {"cid": company_id, "period": period, "day": trigger_day},
    ).one()

    if row.actions == 0:
        return []

    return [
        RiskDraft(
            rule_code="R11",
            risk_key="R11:recompute_required",
            severity="high",
            metrics={
                "actions_after_cutoff": row.actions,
                "latest_action": row.latest,
                "cutoff_day": trigger_day,
                "blocks_downstream": True,
            },
            calculation=(
                f"{row.actions} IMS actions recorded after the {trigger_day}th, "
                f"the latest on {row.latest}"
            ),
            rule_text=(
                "An IMS action was taken after GSTR-2B was drafted, which makes "
                "recomputing 2B from the dashboard mandatory. Figures for this period "
                "are drawn from a superseded statement until that is done."
            ),
        )
    ]


def rule_r12_filing_chain_blocked(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """2B is sequential: a period generates only once the prior 3B is filed.

    A client in arrears is shown stale data by any tool that assumes 2B simply
    arrives on the 14th — and clients in arrears are exactly the ones who need
    the tool. This surfaces on the firm dashboard, not inside the company.
    """
    previous = shift_period(period, -1)
    row = conn.execute(
        text(
            "select gstr3b_filed, gstr2b_generated_at from periods "
            "where company_id = :cid and period = :period"
        ),
        {"cid": company_id, "period": previous},
    ).first()

    if row is None or row.gstr3b_filed:
        return []

    return [
        RiskDraft(
            rule_code="R12",
            risk_key="R12:filing_chain",
            severity="high",
            metrics={
                "blocked_by_period": previous,
                "prior_gstr3b_filed": False,
                "surface_at": spec.thresholds.get("surface_at", "firm_dashboard"),
            },
            calculation=f"GSTR-3B for {previous} is unfiled, so 2B for {period} cannot generate",
            rule_text=(
                "GSTR-2B is sequential. The previous period's GSTR-3B has not been filed, "
                "so this period's 2B cannot generate and every figure for this client is "
                "stale until it does."
            ),
        )
    ]


def rule_r13_blocked_credit(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """Credit that cannot be claimed however cleanly the document reconciles.

    GSTR-2B's ITC Not Available section already carries the classification, so
    it is read rather than re-derived. The CA can override it: eligibility
    turns on the client's own line of business, which 2B has no way to know —
    a goods vehicle is fully eligible, a thirteen-seat passenger vehicle is
    not, and only the client knows which they bought.
    """
    rows = conn.execute(
        text(
            """
            select g.id, g.supplier_gstin, g.supplier_name, g.invoice_no,
                   g.norm_invoice_no, g.invoice_date, g.taxable_value,
                   g.cgst + g.sgst + g.igst + g.cess as tax,
                   g.source_row, g.source_document_id, d.filename
            from gstr2b_lines g
            join documents d on d.id = g.source_document_id
            where g.company_id = :cid and g.period = :period
              and g.itc_available = false
            order by (g.cgst + g.sgst + g.igst + g.cess) desc
            """
        ),
        {"cid": company_id, "period": period},
    ).all()

    return [
        RiskDraft(
            rule_code="R13",
            risk_key=document_key("R13", row.supplier_gstin, row.norm_invoice_no, row.id),
            severity="medium",
            headline_amount=row.tax,
            metrics={
                "supplier_gstin": row.supplier_gstin,
                "supplier_name": row.supplier_name,
                "invoice_no": row.invoice_no,
                "invoice_date": row.invoice_date,
                "blocked_tax": row.tax,
                "source": "GSTR-2B ITC Not Available section",
                "ca_overridable": True,
            },
            calculation=(
                f"{format_inr(row.tax)} of tax on a document GSTR-2B reports as "
                f"ineligible under Sec 17(5)"
            ),
            rule_text=(
                "GSTR-2B reports input tax credit as not available on this document under "
                "Sec 17(5). Overridable: eligibility depends on the client's line of "
                "business, which 2B cannot know."
            ),
            evidence=[
                Evidence(
                    record_type="gstr2b_line",
                    record_id=row.id,
                    document_id=row.source_document_id,
                    source_row=row.source_row,
                    note=f"{row.filename} entry {row.source_row}: ITC Not Available",
                )
            ],
        )
        for row in rows
    ]


def rule_r4b_reversal_reclaimable(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec, *, today: date
) -> list[RiskDraft]:
    """Credit reversed under 37A that the supplier has since filed for.

    Re-availment is permitted via Table 4(D)(1) once the supplier pays, and
    Sec 16(4) does not restrict that reclaim. This is money found rather than
    money lost, and most SMEs never exercise it because nobody tracks it
    across periods — which is only possible if you keep history.
    """
    rows = conn.execute(
        text(
            """
            select g.id, g.supplier_gstin, g.supplier_name, g.invoice_no,
                   g.norm_invoice_no, g.itc_reversal_37a, g.invoice_date,
                   g.source_row, g.source_document_id, d.filename
            from gstr2b_lines g
            join documents d on d.id = g.source_document_id
            where g.company_id = :cid and g.period = :period
              and g.itc_reversal_37a > 0
              and exists (
                    select 1 from gstr2b_lines later
                     where later.company_id = g.company_id
                       and later.supplier_gstin = g.supplier_gstin
                       and later.period > g.period
                       and later.itc_reversal_37a = 0
              )
            order by g.itc_reversal_37a desc
            """
        ),
        {"cid": company_id, "period": period},
    ).all()

    return [
        RiskDraft(
            rule_code="R4b",
            risk_key=document_key("R4b", row.supplier_gstin, row.norm_invoice_no, row.id),
            severity="info",
            headline_amount=row.itc_reversal_37a,
            metrics={
                "supplier_gstin": row.supplier_gstin,
                "supplier_name": row.supplier_name,
                "invoice_no": row.invoice_no,
                "reversed_amount": row.itc_reversal_37a,
                "reclaim_via": spec.thresholds.get("reclaim_table", "4(D)(1)"),
                "sec_16_4_applies": False,
            },
            calculation=(
                f"{format_inr(row.itc_reversal_37a)} was reversed under Rule 37A and the "
                f"supplier has filed in a later period"
            ),
            rule_text=(
                "Credit previously reversed under Rule 37A where the supplier has since "
                "filed. Re-available through Table 4(D)(1) in any later period; the "
                "Sec 16(4) limit does not restrict the reclaim."
            ),
            evidence=[
                Evidence(
                    record_type="gstr2b_line",
                    record_id=row.id,
                    document_id=row.source_document_id,
                    source_row=row.source_row,
                    note=f"{row.filename} entry {row.source_row}: Rule 37A reversal",
                )
            ],
        )
        for row in rows
    ]
