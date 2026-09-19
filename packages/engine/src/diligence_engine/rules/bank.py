"""Domain B — bank against books. The truth test.

R5  BANK_BOOKS_VARIANCE   the period's books and bank disagree
R6  UNIDENTIFIED_DEPOSIT  money arrived and nobody can say from whom

R5's output is a decomposition, not a number. The variance is split into named
buckets and whatever remains is called residual and left called residual.
§08 is blunt about why: labelling what you cannot explain is worth more in the
room than a fabricated fourth category. If the engine can attribute every
rupee, the residual is zero and the card says zero — that is a result, not a
missing feature.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.normalise import format_inr
from diligence_engine.rules.base import Evidence, RiskDraft, RuleSpec

ZERO = Decimal("0.00")


def _scalar(conn: Connection, sql: str, params: dict) -> Decimal:
    value = conn.execute(text(sql), params).scalar()
    return Decimal(value) if value is not None else ZERO


def rule_r5_variance(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    params = {"company_id": company_id, "period": period}

    books_in = _scalar(
        conn,
        "select sum(credit) from ledger_entries where company_id = :company_id "
        "and period = :period and voucher_type = 'Receipt'",
        params,
    )
    books_out = _scalar(
        conn,
        "select sum(debit) from ledger_entries where company_id = :company_id "
        "and period = :period and voucher_type = 'Payment'",
        params,
    )
    bank_in = _scalar(
        conn,
        "select sum(credit) from bank_txns where company_id = :company_id and period = :period",
        params,
    )
    bank_out = _scalar(
        conn,
        "select sum(debit) from bank_txns where company_id = :company_id and period = :period",
        params,
    )

    books_net = books_in - books_out
    bank_net = bank_in - bank_out
    variance = books_net - bank_net

    # Bucket 1: timing. Matched pairs whose two sides fall in different periods —
    # the books recorded it this month, the bank cleared it next.
    timing = _scalar(
        conn,
        """
        select sum(case when le.voucher_type = 'Receipt' then le.credit else -le.debit end)
        from matches m
        join ledger_entries le on le.id = m.right_id
        join bank_txns bt on bt.id = m.left_id
        where m.company_id = :company_id and m.domain = 'bank' and m.status = 'matched'
          and le.period = :period and bt.period <> le.period
        """,
        params,
    )

    # Bucket 2: deposits the bank shows and the books have never heard of.
    unidentified = _scalar(
        conn,
        """
        select sum(bt.credit) from matches m
        join bank_txns bt on bt.id = m.left_id
        where m.company_id = :company_id and m.domain = 'bank' and m.status = 'unmatched'
          and m.left_type = 'bank_txn' and bt.period = :period and bt.credit is not null
        """,
        params,
    )

    # Bucket 3: withdrawals the bank shows and the books have never heard of.
    unidentified_out = _scalar(
        conn,
        """
        select sum(bt.debit) from matches m
        join bank_txns bt on bt.id = m.left_id
        where m.company_id = :company_id and m.domain = 'bank' and m.status = 'unmatched'
          and m.left_type = 'bank_txn' and bt.period = :period and bt.debit is not null
        """,
        params,
    )

    # Bucket 4: book entries with no bank line at all this period.
    unmatched_books = _scalar(
        conn,
        """
        select sum(case when le.voucher_type = 'Receipt' then le.credit else -le.debit end)
        from matches m
        join ledger_entries le on le.id = m.left_id
        where m.company_id = :company_id and m.domain = 'bank' and m.status = 'unmatched'
          and m.left_type = 'ledger_entry' and le.period = :period
        """,
        params,
    )

    explained = timing + unidentified_out - unidentified + unmatched_books
    residual = variance - explained

    turnover = _scalar(
        conn,
        "select sum(debit) from ledger_entries where company_id = :company_id "
        "and period = :period and voucher_type = 'Sales'",
        params,
    )
    turnover_pct = (abs(variance) / turnover * 100).quantize(Decimal("0.01")) if turnover else ZERO

    pct_threshold = Decimal(str(spec.thresholds.get("turnover_pct", 1.0)))
    residual_threshold = Decimal(str(spec.thresholds.get("residual_inr", 50000)))

    breaches_pct = turnover_pct > pct_threshold
    breaches_residual = abs(residual) > residual_threshold
    if not (breaches_pct or breaches_residual):
        return []

    severity = "high" if (breaches_pct and breaches_residual) else "medium"

    return [
        RiskDraft(
            rule_code="R5",
            risk_key="R5:bank_books_variance",
            severity=severity,
            headline_amount=abs(variance),
            headline_pct=turnover_pct,
            metrics={
                "books_inflow": books_in,
                "books_outflow": books_out,
                "bank_inflow": bank_in,
                "bank_outflow": bank_out,
                "variance": variance,
                "buckets": {
                    "timing_next_period": timing,
                    "unidentified_deposits": -unidentified,
                    "unidentified_withdrawals": unidentified_out,
                    "unmatched_book_entries": unmatched_books,
                    "residual": residual,
                },
                "turnover": turnover,
                "variance_pct_of_turnover": turnover_pct,
            },
            calculation=(
                f"books net {format_inr(books_net)} - bank net {format_inr(bank_net)} "
                f"= {format_inr(variance)}  "
                f"[timing {format_inr(timing)} | unidentified deposits "
                f"{format_inr(-unidentified)} | unidentified withdrawals "
                f"{format_inr(unidentified_out)} | unmatched book entries "
                f"{format_inr(unmatched_books)} | RESIDUAL {format_inr(residual)}]"
            ),
            rule_text=(
                f"Variance exceeds {pct_threshold}% of turnover or leaves a residual above "
                f"{format_inr(residual_threshold)}. The residual is what the engine cannot "
                f"attribute, and is reported as such rather than assigned a cause."
            ),
        )
    ]


def rule_r6_unidentified_deposit(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """A credit of size, with no party resolved and no ledger entry behind it.

    A party guessed from a narration would be worse than none: it produces a
    row that looks explained and is not.
    """
    floor = Decimal(str(spec.thresholds.get("min_credit_inr", 50000)))
    rows = conn.execute(
        text(
            """
            select bt.id, bt.txn_date, bt.narration, bt.ref_no, bt.credit,
                   bt.source_row, bt.source_document_id, d.filename
            from matches m
            join bank_txns bt on bt.id = m.left_id
            join documents d on d.id = bt.source_document_id
            where m.company_id = :company_id
              and m.domain = 'bank'
              and m.status = 'unmatched'
              and m.left_type = 'bank_txn'
              and bt.period = :period
              and bt.credit >= :floor
              and bt.party_id is null
            order by bt.credit desc
            """
        ),
        {"company_id": company_id, "period": period, "floor": floor},
    ).all()

    return [
        RiskDraft(
            rule_code="R6",
            # A bank reference can be absent; the row id is stable and unique.
            risk_key=f"R6:{row.ref_no or row.id}",
            severity="medium",
            headline_amount=row.credit,
            metrics={
                "txn_date": row.txn_date,
                "narration": row.narration,
                "ref_no": row.ref_no,
                "amount": row.credit,
                "party_resolved": False,
                "ledger_counterpart": None,
            },
            calculation=(
                f"{format_inr(row.credit)} credited on {row.txn_date:%d %b %Y} with no "
                f"party resolved from the narration and no ledger entry to match"
            ),
            rule_text=(
                f"Bank credit of {format_inr(floor)} or more that party resolution could "
                f"not attribute and reconciliation could not match."
            ),
            evidence=[
                Evidence(
                    record_type="bank_txn",
                    record_id=row.id,
                    document_id=row.source_document_id,
                    source_row=row.source_row,
                    note=f"{row.filename} row {row.source_row}: {row.narration}",
                )
            ],
        )
        for row in rows
    ]
