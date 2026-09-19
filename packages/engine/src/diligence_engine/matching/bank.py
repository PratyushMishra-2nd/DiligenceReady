"""Bank against books — a different problem, because narration is free text.

Nobody does this step (§03, step 8). The register-versus-2B comparison at
least has two structured documents; here one side is a Tally voucher and the
other is whatever a payment gateway concatenated into a narration field.

Matching runs in two passes, strongest first:

1.  **Party, amount, date.** The narration resolved to a party at ingestion,
    the amounts agree within a rupee, and the dates are within five days.
2.  **Amount and date alone**, for rows where neither side has a party —
    salary runs, GST challans, bank charges. A payment with no counterparty
    name is not a mystery; it is a category. Matching it here keeps it out of
    the variance, where it would masquerade as an exception.

What survives both passes is genuinely unexplained, and §08 is emphatic about
what to do with it: label it residual and leave it labelled. A fabricated
fourth bucket reads better and is worth less.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.documents import stable_id

AMOUNT_TOLERANCE = Decimal("1.00")
DATE_WINDOW_DAYS = 5

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
class BankStats:
    pairs: int = 0
    by_method: dict[str, int] = field(default_factory=dict)
    unmatched_bank: int = 0
    unmatched_books: int = 0


@dataclass(frozen=True)
class _Side:
    row_id: uuid.UUID
    period: str
    party_id: uuid.UUID | None
    day: date
    amount: Decimal
    direction: str  # in | out


def _load_bank(conn: Connection, company_id: uuid.UUID) -> list[_Side]:
    rows = conn.execute(
        text(
            "select id, period, party_id, txn_date, debit, credit "
            "from bank_txns where company_id = :company_id order by txn_date, source_row"
        ),
        {"company_id": company_id},
    ).all()
    return [
        _Side(
            row_id=row.id,
            period=row.period,
            party_id=row.party_id,
            day=row.txn_date,
            amount=row.credit if row.credit is not None else row.debit,
            direction="in" if row.credit is not None else "out",
        )
        for row in rows
    ]


def _load_vouchers(conn: Connection, company_id: uuid.UUID) -> list[_Side]:
    """Receipts and payments only. Sales rows are receivables, not money moved."""
    rows = conn.execute(
        text(
            "select id, period, party_id, entry_date, debit, credit, voucher_type "
            "from ledger_entries "
            "where company_id = :company_id and voucher_type in ('Payment', 'Receipt') "
            "order by entry_date, source_row"
        ),
        {"company_id": company_id},
    ).all()
    return [
        _Side(
            row_id=row.id,
            period=row.period,
            party_id=row.party_id,
            day=row.entry_date,
            amount=row.credit if row.voucher_type == "Receipt" else row.debit,
            direction="in" if row.voucher_type == "Receipt" else "out",
        )
        for row in rows
        if (row.credit if row.voucher_type == "Receipt" else row.debit) is not None
    ]


def _paise(amount: Decimal) -> int:
    return int(amount * 100)


def reconcile_bank(conn: Connection, company_id: uuid.UUID) -> BankStats:
    """Recompute every bank match for a company. Safe to rerun."""
    bank = _load_bank(conn, company_id)
    books = _load_vouchers(conn, company_id)

    conn.execute(
        text("delete from matches where company_id = :company_id and domain = 'bank'"),
        {"company_id": company_id},
    )

    # Index the books by amount in paise, so a rupee of tolerance is a small
    # integer window rather than a scan.
    by_amount: dict[int, list[_Side]] = defaultdict(list)
    for voucher in books:
        by_amount[_paise(voucher.amount)].append(voucher)

    taken_books: set[uuid.UUID] = set()
    stats = BankStats()
    rows: list[dict] = []
    matched_bank: set[uuid.UUID] = set()

    tolerance_paise = _paise(AMOUNT_TOLERANCE)

    for require_party in (True, False):
        for line in bank:
            if line.row_id in matched_bank:
                continue
            if require_party and line.party_id is None:
                continue

            best: _Side | None = None
            best_gap = DATE_WINDOW_DAYS + 1
            target = _paise(line.amount)

            for offset in range(-tolerance_paise, tolerance_paise + 1):
                for voucher in by_amount.get(target + offset, ()):
                    if voucher.row_id in taken_books:
                        continue
                    if voucher.direction != line.direction:
                        continue
                    if require_party:
                        if voucher.party_id is None or voucher.party_id != line.party_id:
                            continue
                    elif voucher.party_id is not None or line.party_id is not None:
                        continue

                    gap = abs((line.day - voucher.day).days)
                    if gap <= DATE_WINDOW_DAYS and gap < best_gap:
                        best, best_gap = voucher, gap

            if best is None:
                continue

            taken_books.add(best.row_id)
            matched_bank.add(line.row_id)
            method = "strong" if (best_gap == 0 and require_party) else "amount_date"
            stats.pairs += 1
            stats.by_method[method] = stats.by_method.get(method, 0) + 1
            rows.append(
                _row(
                    company_id,
                    period=line.period,
                    left_type="bank_txn",
                    left_id=line.row_id,
                    right_type="ledger_entry",
                    right_id=best.row_id,
                    status="matched",
                    method=method,
                    score=Decimal("1.000") if method == "strong" else Decimal("0.850"),
                    breakdown={
                        "party": bool(require_party),
                        "amount_delta_paise": target - _paise(best.amount),
                        "date_gap_days": best_gap,
                    },
                    amount_delta=line.amount - best.amount,
                    date_delta_days=(line.day - best.day).days,
                )
            )

    for line in bank:
        if line.row_id in matched_bank:
            continue
        stats.unmatched_bank += 1
        rows.append(
            _row(
                company_id,
                period=line.period,
                left_type="bank_txn",
                left_id=line.row_id,
                right_type=None,
                right_id=None,
                status="unmatched",
                method="none",
                score=None,
                breakdown=None,
                amount_delta=None,
                date_delta_days=None,
            )
        )

    for voucher in books:
        if voucher.row_id in taken_books:
            continue
        stats.unmatched_books += 1
        rows.append(
            _row(
                company_id,
                period=voucher.period,
                left_type="ledger_entry",
                left_id=voucher.row_id,
                right_type=None,
                right_id=None,
                status="unmatched",
                method="none",
                score=None,
                breakdown=None,
                amount_delta=None,
                date_delta_days=None,
            )
        )

    for start in range(0, len(rows), 500):
        conn.execute(text(_MATCH_INSERT), rows[start : start + 500])

    return stats


def _row(
    company_id: uuid.UUID,
    *,
    period: str,
    left_type: str,
    left_id: uuid.UUID,
    right_type: str | None,
    right_id: uuid.UUID | None,
    status: str,
    method: str,
    score: Decimal | None,
    breakdown: dict | None,
    amount_delta: Decimal | None,
    date_delta_days: int | None,
) -> dict:
    return {
        "id": stable_id("match", company_id, "bank", left_type, left_id),
        "company_id": company_id,
        "period": period,
        "domain": "bank",
        "left_type": left_type,
        "left_id": left_id,
        "right_type": right_type,
        "right_id": right_id,
        "status": status,
        "match_method": method,
        "match_score": score,
        "score_breakdown": json.dumps(breakdown) if breakdown is not None else None,
        "amount_delta": amount_delta,
        "date_delta_days": date_delta_days,
    }
