"""GST domain matcher: the purchase register against GSTR-2B.

Three properties this has that a spreadsheet cannot:

**It blocks on the supplier, not the invoice number.** The register has no
GSTIN column, so the party layer supplies one. Comparison happens inside a
supplier, which is why "4921" from one vendor never matches "4921" from
another.

**It looks across periods.** §15.1 is explicit that an invoice missing from
August's 2B often appears in September's — the supplier filed late. A matcher
confined to one period reports every late filing as lost input tax credit, a
CA sees that once, and closes the tab. Candidates therefore come from every
period, and the period gap is recorded on the match.

**It assigns one-to-one.** Greedy by descending score, each record consumed
once. The second register row claiming the same 2B line is a duplicate, which
is a finding rather than a matching failure.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal

from rapidfuzz import fuzz, process
from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.documents import stable_id
from diligence_engine.matching.score import (
    ACCEPT_FLOOR,
    W_GSTIN,
    Candidate,
    Scored,
    score_pair,
)
from diligence_engine.normalise import periods_between

_FUZZY_CANDIDATES = 3
_FUZZY_CUTOFF = 60.0
DEFAULT_TOLERANCE = Decimal("1.00")

_MATCH_INSERT = """
insert into matches (
    id, company_id, period, domain, left_type, left_id, right_type, right_id,
    status, match_method, match_score, score_breakdown,
    amount_delta, date_delta_days
) values (
    :id, :company_id, :period, :domain, :left_type, :left_id, :right_type, :right_id,
    :status, :match_method, :match_score, cast(:score_breakdown as jsonb),
    :amount_delta, :date_delta_days
)
"""


@dataclass
class MatchStats:
    pairs: int = 0
    by_method: dict[str, int] = None  # type: ignore[assignment]
    unmatched_pr: int = 0
    unmatched_2b: int = 0
    duplicates: int = 0
    late_filed: int = 0

    def __post_init__(self) -> None:
        if self.by_method is None:
            self.by_method = {}


@dataclass(frozen=True)
class _Row:
    candidate: Candidate
    period: str


def tolerance_for(conn: Connection) -> Decimal:
    """Read the per-head tolerance from the rule registry, never from a literal."""
    row = conn.execute(
        text("select thresholds ->> 'tolerance_inr' as tol from rules where code = 'R2'")
    ).first()
    if row is None or row.tol is None:
        return DEFAULT_TOLERANCE
    return Decimal(str(row.tol))


def _load_purchases(conn: Connection, company_id: uuid.UUID) -> list[_Row]:
    rows = conn.execute(
        text(
            "select id, period, supplier_gstin, norm_invoice_no, invoice_date, "
            "       taxable_value, cgst, sgst, igst, cess "
            "from purchase_invoices where company_id = :company_id "
            "order by invoice_date, source_row"
        ),
        {"company_id": company_id},
    ).all()
    return [
        _Row(
            candidate=Candidate(
                row_id=row.id,
                gstin=row.supplier_gstin,
                norm_invoice_no=row.norm_invoice_no,
                doc_date=row.invoice_date,
                taxable=row.taxable_value,
                cgst=row.cgst,
                sgst=row.sgst,
                igst=row.igst,
                cess=row.cess,
            ),
            period=row.period,
        )
        for row in rows
    ]


def _load_gstr2b(conn: Connection, company_id: uuid.UUID) -> list[_Row]:
    """The 2B rows that are comparable to a purchase-register row, and only those.

    GSTR-2B has sixteen tables and most of them are not supplier invoices:

    * **CDNR** notes correct an earlier document rather than standing as one,
      and have no register row of their own. Matching them would report every
      purchase return as a missing invoice.
    * **ISD** is credit distributed by a head office. §15.2 is explicit that
      distributed credit never matches a purchase invoice.
    * **IMPG** is keyed on a bill of entry and carries no supplier-wise detail
      at all, so there is nothing to block on.
    * **ECO** is a supply the operator paid tax on under Sec 9(5).

    Feeding those into the matcher would not find anything; it would just
    manufacture orphans and drive the coverage figure down for no reason. They
    are reported separately instead, by `reporting.other_itc`.

    **B2BA supersedes B2B.** §15: the amended record replaces the original
    regardless of any action already taken on it. Leaving both in the pool
    means one of them is always an orphan.
    """
    rows = conn.execute(
        text(
            """
            select g.id, g.period, g.supplier_gstin, g.norm_invoice_no, g.invoice_date,
                   g.taxable_value, g.cgst, g.sgst, g.igst, g.cess
            from gstr2b_lines g
            where g.company_id = :company_id
              and g.section in ('B2B', 'B2BA')
              and not exists (
                    select 1 from gstr2b_lines amendment
                     where amendment.company_id = g.company_id
                       and amendment.section = 'B2BA'
                       and amendment.supplier_gstin = g.supplier_gstin
                       and amendment.amends_invoice_no = g.norm_invoice_no
                       and g.section = 'B2B'
              )
            order by g.period, g.source_row
            """
        ),
        {"company_id": company_id},
    ).all()
    return [
        _Row(
            candidate=Candidate(
                row_id=row.id,
                gstin=row.supplier_gstin,
                norm_invoice_no=row.norm_invoice_no,
                doc_date=row.invoice_date,
                taxable=row.taxable_value,
                cgst=row.cgst,
                sgst=row.sgst,
                igst=row.igst,
                cess=row.cess,
            ),
            period=row.period,
        )
        for row in rows
    ]


def _block(rows: list[_Row]) -> dict[str, list[_Row]]:
    blocks: dict[str, list[_Row]] = defaultdict(list)
    for row in rows:
        blocks[row.candidate.gstin or ""].append(row)
    return blocks


def _candidate_pairs(
    left_rows: list[_Row], right_rows: list[_Row], tolerance: Decimal
) -> list[tuple[Decimal, _Row, _Row, Scored]]:
    """Every plausible pair inside one supplier block, scored."""
    by_number: dict[str, list[_Row]] = defaultdict(list)
    for row in right_rows:
        by_number[row.candidate.norm_invoice_no].append(row)
    numbers = list(by_number)

    scored: list[tuple[Decimal, _Row, _Row, Scored]] = []
    for left in left_rows:
        seen: set[object] = set()
        pool: list[_Row] = list(by_number.get(left.candidate.norm_invoice_no, []))

        # Approximation logic: the document number was retyped, not shared.
        if numbers:
            for name, score, _ in process.extract(
                left.candidate.norm_invoice_no,
                numbers,
                scorer=fuzz.ratio,
                limit=_FUZZY_CANDIDATES,
                score_cutoff=_FUZZY_CUTOFF,
            ):
                if score < 100:
                    pool.extend(by_number[name])

        for right in pool:
            if right.candidate.row_id in seen:
                continue
            seen.add(right.candidate.row_id)
            result = score_pair(left.candidate, right.candidate, tolerance=tolerance)
            if result.score >= ACCEPT_FLOOR:
                scored.append((result.score, left, right, result))

    return scored


def reconcile_gst(conn: Connection, company_id: uuid.UUID) -> MatchStats:
    """Recompute every GST match for a company. Safe to rerun."""
    tolerance = tolerance_for(conn)
    purchases = _load_purchases(conn, company_id)
    gstr2b = _load_gstr2b(conn, company_id)

    conn.execute(
        text("delete from matches where company_id = :company_id and domain = 'gst'"),
        {"company_id": company_id},
    )

    purchase_blocks = _block(purchases)
    gstr2b_blocks = _block(gstr2b)

    scored: list[tuple[Decimal, _Row, _Row, Scored]] = []
    for gstin, left_rows in purchase_blocks.items():
        right_rows = gstr2b_blocks.get(gstin, [])
        if not right_rows:
            continue
        scored.extend(_candidate_pairs(left_rows, right_rows, tolerance))

    # Greedy, descending, one-to-one. Ties break on the ids so a rerun on the
    # same data produces the same assignment.
    scored.sort(key=lambda item: (-item[0], str(item[1].candidate.row_id)))

    taken_left: set[object] = set()
    taken_right: set[object] = set()
    stats = MatchStats()
    rows: list[dict] = []

    for _, left, right, result in scored:
        if left.candidate.row_id in taken_left or right.candidate.row_id in taken_right:
            continue
        taken_left.add(left.candidate.row_id)
        taken_right.add(right.candidate.row_id)

        period_gap = periods_between(left.period, right.period)
        if period_gap > 0:
            stats.late_filed += 1

        rows.append(
            _match_row(
                company_id,
                period=left.period,
                left_type="purchase_invoice",
                left_id=left.candidate.row_id,
                right_type="gstr2b_line",
                right_id=right.candidate.row_id,
                status="matched",
                method=result.category,
                result=result,
                period_gap=period_gap,
            )
        )
        stats.pairs += 1
        stats.by_method[result.category] = stats.by_method.get(result.category, 0) + 1

    # Register rows with nothing on the other side. A second row claiming a
    # document another row already matched is a duplicate, not an absence.
    claimed: dict[tuple[str, str], int] = defaultdict(int)
    for left in purchases:
        if left.candidate.row_id in taken_left:
            claimed[(left.candidate.gstin or "", left.candidate.norm_invoice_no)] += 1

    # Whether a supplier appears anywhere in any 2B at all. It is the
    # difference between "this supplier filed, but not this document" and
    # "this supplier has filed nothing", which are different conversations.
    suppliers_in_2b = {row.candidate.gstin for row in gstr2b if row.candidate.gstin}

    for left in purchases:
        if left.candidate.row_id in taken_left:
            continue
        key = (left.candidate.gstin or "", left.candidate.norm_invoice_no)
        duplicate = claimed[key] > 0
        if duplicate:
            stats.duplicates += 1
        else:
            stats.unmatched_pr += 1

        # An orphan still carries a partial score: the supplier resolved even
        # though the document did not. Reporting four zeros would suggest the
        # matcher knew nothing about the row, which is not what happened.
        supplier_known = left.candidate.gstin in suppliers_in_2b
        orphan_breakdown = None
        orphan_score = None
        if not duplicate:
            gstin_component = 1.0 if supplier_known else 0.0
            orphan_breakdown = {
                "gstin": gstin_component,
                "invno": 0.0,
                "amount": 0.0,
                "date": 0.0,
                "supplier_present_in_2b": supplier_known,
            }
            orphan_score = Decimal(str(round(float(W_GSTIN) * gstin_component, 3)))

        rows.append(
            _match_row(
                company_id,
                period=left.period,
                left_type="purchase_invoice",
                left_id=left.candidate.row_id,
                right_type=None,
                right_id=None,
                status="duplicate" if duplicate else "unmatched",
                method="none" if duplicate else "orphan_pr",
                result=None,
                period_gap=0,
                score=orphan_score,
                breakdown=orphan_breakdown,
            )
        )

    for right in gstr2b:
        if right.candidate.row_id in taken_right:
            continue
        stats.unmatched_2b += 1
        rows.append(
            _match_row(
                company_id,
                period=right.period,
                left_type="gstr2b_line",
                left_id=right.candidate.row_id,
                right_type=None,
                right_id=None,
                status="unmatched",
                method="orphan_2b",
                result=None,
                period_gap=0,
            )
        )

    for start in range(0, len(rows), 500):
        conn.execute(text(_MATCH_INSERT), rows[start : start + 500])

    return stats


def _match_row(
    company_id: uuid.UUID,
    *,
    period: str,
    left_type: str,
    left_id: object,
    right_type: str | None,
    right_id: object | None,
    status: str,
    method: str,
    result: Scored | None,
    period_gap: int,
    score: Decimal | None = None,
    breakdown: dict | None = None,
) -> dict:
    if result is not None:
        breakdown = {
            **result.breakdown,
            "parameters_matched": result.matched_parameters,
            "period_gap": period_gap,
        }
    serialised = json.dumps(breakdown) if breakdown is not None else None

    return {
        "id": stable_id("match", company_id, "gst", left_type, left_id),
        "company_id": company_id,
        "period": period,
        "domain": "gst",
        "left_type": left_type,
        "left_id": left_id,
        "right_type": right_type,
        "right_id": right_id,
        "status": status,
        "match_method": method,
        "match_score": result.score if result else score,
        "score_breakdown": serialised,
        "amount_delta": result.amount_delta if result else None,
        "date_delta_days": result.date_delta_days if result else None,
    }
