"""Domain A — GST and input tax credit. The money.

R1  ITC_UNMATCHED        register rows with no counterpart in any 2B, aged
R2  ITC_AMOUNT_MISMATCH   matched, but a value is out of tolerance
R3  DUPLICATE_PURCHASE    the same document booked twice
R4  ITC_REVERSAL_37A      GSTN's own reversal figure, read not inferred

Two things here came out of the primary sources rather than the first draft,
and both change what a CA sees:

**R1 ages.** An invoice missing from August's 2B often appears in September's.
Reporting it as money at risk on day one trains the user to ignore the tool.
Severity is a function of how many periods it has been missing and how close
the Sec 16(4) window is to closing, never of a single month's snapshot.

**R4 reads.** The first draft planned to guess at non-filing vendors by
diffing supplier lists across periods. GSTR-2B already carries a Rule 37A
reversal computed by GSTN from the periods the supplier has not filed for. A
heuristic that disagrees with the government's own figure is a bug.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.normalise import format_inr, periods_between
from diligence_engine.rules.base import Evidence, RiskDraft, RuleSpec, document_key

_SEC_16_4_MONTH = 11
_SEC_16_4_DAY = 30


def sec_16_4_deadline(invoice_date: date) -> date:
    """The outer limit for claiming credit on an invoice.

    Sec 16(4): 30 November following the end of the financial year the invoice
    falls in, or the date of filing the annual return, whichever is earlier.
    Only the November limit is modelled — the annual-return date is per
    taxpayer and is not in any feed we read.
    """
    fy_end_year = invoice_date.year if invoice_date.month >= 4 else invoice_date.year - 1
    return date(fy_end_year + 1, _SEC_16_4_MONTH, _SEC_16_4_DAY)


def _age_severity(age_periods: int, days_to_deadline: int, thresholds: dict) -> tuple[str, str]:
    """Severity plus the sentence explaining why, from age and the statutory clock."""
    at_risk = int(thresholds.get("at_risk_periods", 3))
    chase = int(thresholds.get("chase_periods", 2))

    if days_to_deadline <= 60:
        return "high", (
            f"at risk: {days_to_deadline} days to the Sec 16(4) cut-off"
            if days_to_deadline >= 0
            else f"lost: the Sec 16(4) cut-off passed {abs(days_to_deadline)} days ago"
        )
    if age_periods >= at_risk:
        return "high", f"at risk: unmatched for {age_periods} periods"
    if age_periods >= chase:
        return "medium", f"chase the vendor: unmatched for {age_periods} periods"
    return "low", "watch: may still appear in a later 2B"


def rule_r1_itc_unmatched(
    conn: Connection,
    company_id: uuid.UUID,
    period: str,
    spec: RuleSpec,
    *,
    latest_period: str,
    today: date,
) -> list[RiskDraft]:
    rows = conn.execute(
        text(
            """
            select pi.id, pi.invoice_no, pi.norm_invoice_no, pi.invoice_date,
                   pi.taxable_value, pi.cgst, pi.sgst, pi.igst, pi.cess,
                   pi.total_value, pi.supplier_gstin, pi.source_row,
                   pi.source_document_id, d.filename,
                   coalesce(p.canonical_name, 'unresolved supplier') as supplier_name
            from matches m
            join purchase_invoices pi on pi.id = m.left_id
            join documents d on d.id = pi.source_document_id
            left join parties p on p.id = pi.party_id
            where m.company_id = :company_id
              and m.domain = 'gst'
              and m.status = 'unmatched'
              and m.left_type = 'purchase_invoice'
              and m.period = :period
            order by pi.taxable_value desc
            """
        ),
        {"company_id": company_id, "period": period},
    ).all()

    drafts = []
    for row in rows:
        tax = row.cgst + row.sgst + row.igst + row.cess
        age = periods_between(period, latest_period)
        deadline = sec_16_4_deadline(row.invoice_date)
        days_left = (deadline - today).days
        severity, reason = _age_severity(age, days_left, spec.thresholds)

        drafts.append(
            RiskDraft(
                rule_code="R1",
                risk_key=document_key("R1", row.supplier_gstin, row.norm_invoice_no, row.id),
                severity=severity,
                headline_amount=tax,
                metrics={
                    "supplier_gstin": row.supplier_gstin,
                    "supplier_name": row.supplier_name,
                    "invoice_no": row.invoice_no,
                    "invoice_date": row.invoice_date,
                    "taxable_value": row.taxable_value,
                    "itc_at_stake": tax,
                    "age_periods": age,
                    "sec_16_4_deadline": deadline,
                    "days_to_deadline": days_left,
                    "reason": reason,
                },
                calculation=(
                    f"CGST {format_inr(row.cgst)} + SGST {format_inr(row.sgst)} + "
                    f"IGST {format_inr(row.igst)} + Cess {format_inr(row.cess)} "
                    f"= {format_inr(tax)} of input tax credit with no 2B counterpart"
                ),
                rule_text=(
                    "Purchase invoice present in the register with no matching record in "
                    f"any GSTR-2B. Sec 16(4) cut-off {deadline:%d %b %Y}; {reason}."
                ),
                evidence=[
                    Evidence(
                        record_type="purchase_invoice",
                        record_id=row.id,
                        document_id=row.source_document_id,
                        source_row=row.source_row,
                        note=f"{row.filename} row {row.source_row}: {row.invoice_no}",
                    )
                ],
            )
        )
    return drafts


def rule_r2_amount_mismatch(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    tolerance = Decimal(str(spec.thresholds.get("tolerance_inr", "1.00")))
    rows = conn.execute(
        text(
            """
            select pi.id as purchase_id, pi.invoice_no, pi.norm_invoice_no,
                   pi.supplier_gstin, pi.taxable_value as books_taxable,
                   pi.cgst as books_cgst, pi.sgst as books_sgst, pi.igst as books_igst,
                   pi.cess as books_cess, pi.source_row, pi.source_document_id,
                   d.filename,
                   g.id as gstr2b_id, g.taxable_value as portal_taxable,
                   g.cgst as portal_cgst, g.sgst as portal_sgst, g.igst as portal_igst,
                   g.cess as portal_cess, g.source_row as portal_row,
                   g.source_document_id as portal_document_id, gd.filename as portal_filename,
                   coalesce(p.canonical_name, g.supplier_name) as supplier_name,
                   m.amount_delta
            from matches m
            join purchase_invoices pi on pi.id = m.left_id
            join gstr2b_lines g on g.id = m.right_id
            join documents d on d.id = pi.source_document_id
            join documents gd on gd.id = g.source_document_id
            left join parties p on p.id = pi.party_id
            where m.company_id = :company_id
              and m.domain = 'gst'
              and m.status = 'matched'
              and m.period = :period
              and (
                    abs(pi.taxable_value - g.taxable_value) > :tolerance
                 or abs(pi.cgst - g.cgst) > :tolerance
                 or abs(pi.sgst - g.sgst) > :tolerance
                 or abs(pi.igst - g.igst) > :tolerance
                 or abs(pi.cess - g.cess) > :tolerance
              )
            order by abs(pi.taxable_value - g.taxable_value) desc
            """
        ),
        {"company_id": company_id, "period": period, "tolerance": tolerance},
    ).all()

    drafts = []
    for row in rows:
        delta = row.books_taxable - row.portal_taxable
        heads = {
            "cgst": row.books_cgst - row.portal_cgst,
            "sgst": row.books_sgst - row.portal_sgst,
            "igst": row.books_igst - row.portal_igst,
            "cess": row.books_cess - row.portal_cess,
        }
        breached = [name for name, value in heads.items() if abs(value) > tolerance]

        drafts.append(
            RiskDraft(
                rule_code="R2",
                risk_key=document_key(
                    "R2", row.supplier_gstin, row.norm_invoice_no, row.purchase_id
                ),
                severity="medium",
                headline_amount=abs(delta),
                metrics={
                    "supplier_gstin": row.supplier_gstin,
                    "supplier_name": row.supplier_name,
                    "invoice_no": row.invoice_no,
                    "books_taxable": row.books_taxable,
                    "portal_taxable": row.portal_taxable,
                    "taxable_delta": delta,
                    "head_deltas": {name: str(value) for name, value in heads.items()},
                    "heads_out_of_tolerance": breached,
                    "tolerance_inr": tolerance,
                },
                calculation=(
                    f"books {format_inr(row.books_taxable)} - "
                    f"2B {format_inr(row.portal_taxable)} = {format_inr(delta)}"
                ),
                rule_text=(
                    f"Matched document whose value differs by more than the "
                    f"{format_inr(tolerance)} tolerance. GSTN applies tolerance to each tax "
                    f"head separately, never to the consolidated amount."
                ),
                evidence=[
                    Evidence(
                        record_type="purchase_invoice",
                        record_id=row.purchase_id,
                        document_id=row.source_document_id,
                        source_row=row.source_row,
                        note=f"{row.filename} row {row.source_row}: books value",
                    ),
                    Evidence(
                        record_type="gstr2b_line",
                        record_id=row.gstr2b_id,
                        document_id=row.portal_document_id,
                        source_row=row.portal_row,
                        note=f"{row.portal_filename} entry {row.portal_row}: portal value",
                    ),
                ],
            )
        )
    return drafts


def rule_r3_duplicate(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """The same supplier and document number booked twice.

    Amendments are excluded: a B2BA or CDNRA row is a correction the supplier
    filed, not a second booking, and flagging it would turn correct behaviour
    into an exception.
    """
    rows = conn.execute(
        text(
            """
            select pi.id, pi.invoice_no, pi.norm_invoice_no, pi.supplier_gstin,
                   pi.total_value, pi.invoice_date, pi.source_row, pi.source_document_id,
                   d.filename,
                   coalesce(p.canonical_name, 'unresolved supplier') as supplier_name,
                   (select count(*) from purchase_invoices sib
                     where sib.company_id = pi.company_id
                       and sib.supplier_gstin = pi.supplier_gstin
                       and sib.norm_invoice_no = pi.norm_invoice_no) as occurrences
            from matches m
            join purchase_invoices pi on pi.id = m.left_id
            join documents d on d.id = pi.source_document_id
            left join parties p on p.id = pi.party_id
            where m.company_id = :company_id
              and m.domain = 'gst'
              and m.status = 'duplicate'
              and m.period = :period
              and not exists (
                    select 1 from gstr2b_lines g
                     where g.company_id = pi.company_id
                       and g.supplier_gstin = pi.supplier_gstin
                       and g.norm_invoice_no = pi.norm_invoice_no
                       and g.is_amendment
              )
            order by pi.total_value desc
            """
        ),
        {"company_id": company_id, "period": period},
    ).all()

    return [
        RiskDraft(
            rule_code="R3",
            risk_key=document_key("R3", row.supplier_gstin, row.norm_invoice_no, row.id),
            severity="high",
            headline_amount=row.total_value,
            metrics={
                "supplier_gstin": row.supplier_gstin,
                "supplier_name": row.supplier_name,
                "invoice_no": row.invoice_no,
                "invoice_date": row.invoice_date,
                "occurrences": row.occurrences,
                "duplicated_value": row.total_value,
            },
            calculation=(
                f"{row.occurrences} register rows carry supplier {row.supplier_gstin} "
                f"document {row.norm_invoice_no}; one 2B record exists. "
                f"Overstated by {format_inr(row.total_value)}"
            ),
            rule_text=(
                "Same supplier GSTIN and document number booked more than once in the "
                "purchase register. Supplier amendments are excluded."
            ),
            evidence=[
                Evidence(
                    record_type="purchase_invoice",
                    record_id=row.id,
                    document_id=row.source_document_id,
                    source_row=row.source_row,
                    note=f"{row.filename} row {row.source_row}: the duplicate booking",
                )
            ],
        )
        for row in rows
    ]


def rule_r4_reversal_37a(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec, *, today: date
) -> list[RiskDraft]:
    rows = conn.execute(
        text(
            """
            select g.id, g.invoice_no, g.norm_invoice_no, g.supplier_gstin, g.supplier_name,
                   g.invoice_date, g.itc_reversal_37a, g.source_row, g.source_document_id,
                   d.filename
            from gstr2b_lines g
            join documents d on d.id = g.source_document_id
            where g.company_id = :company_id
              and g.period = :period
              and g.itc_reversal_37a > 0
            order by g.itc_reversal_37a desc
            """
        ),
        {"company_id": company_id, "period": period},
    ).all()

    drafts = []
    for row in rows:
        deadline = sec_16_4_deadline(row.invoice_date)  # 30 Nov, same clock as Rule 37A
        days_left = (deadline - today).days
        severity = "high" if days_left <= 60 else "medium"

        drafts.append(
            RiskDraft(
                rule_code="R4",
                risk_key=document_key("R4", row.supplier_gstin, row.norm_invoice_no, row.id),
                severity=severity,
                headline_amount=row.itc_reversal_37a,
                metrics={
                    "supplier_gstin": row.supplier_gstin,
                    "supplier_name": row.supplier_name,
                    "invoice_no": row.invoice_no,
                    "reversal_amount": row.itc_reversal_37a,
                    "reverse_by": deadline,
                    "days_to_reversal_deadline": days_left,
                    "source": "GSTR-2B ITC Reversal section (computed by GSTN)",
                    "reclaim_path": "Table 4(D)(1), once the supplier pays. Sec 16(4) does "
                    "not bar the reclaim.",
                },
                calculation=(
                    f"GSTR-2B reports {format_inr(row.itc_reversal_37a)} of Rule 37A "
                    f"reversal against supplier {row.supplier_gstin}"
                ),
                rule_text=(
                    "Supplier reported the invoice in GSTR-1 but has not filed GSTR-3B, so "
                    f"the credit must be reversed by {deadline:%d %b %Y}. Interest under "
                    "Sec 50 applies beyond that. Read from GSTN's own computation, not "
                    "inferred."
                ),
                evidence=[
                    Evidence(
                        record_type="gstr2b_line",
                        record_id=row.id,
                        document_id=row.source_document_id,
                        source_row=row.source_row,
                        note=f"{row.filename} entry {row.source_row}: ITC Reversal section",
                    )
                ],
            )
        )
    return drafts
