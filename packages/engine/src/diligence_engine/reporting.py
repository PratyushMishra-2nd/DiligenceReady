"""Read queries behind every figure the interface shows.

Each function here is the whole answer to "where did this number come from?".
They are plain SQL aggregates over the match and risk tables, which is the
claim the product makes about itself — so they live in the engine, are shared
by the CLI and the API, and are never reimplemented in a view layer where they
could quietly drift.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest import storage
from diligence_engine.ingest.gstr2b_shape import describe, iter_entries

ZERO = Decimal("0.00")


def _pct(part: int, whole: int) -> Decimal:
    if not whole:
        return ZERO
    return (Decimal(part) / Decimal(whole) * 100).quantize(Decimal("0.1"))


# ── firm level ──────────────────────────────────────────────────────────────


def firm_dashboard(conn: Connection, firm_id: uuid.UUID) -> list[dict]:
    """Every company one firm carries, with its latest period's headline state.

    This is the first screen, and it is deliberately the firm's, not a
    company's: the buyer is a practice carrying thirty to eighty clients, and
    a tool that opens on one company has already misunderstood who is using it.

    The firm is a required argument rather than an optional filter. A caller
    that forgets it does not compile, which is the only version of access
    control that survives contact with a deadline.
    """
    companies = conn.execute(
        text(
            """
            select c.id, c.name, c.gstin, f.name as firm_name,
                   -- The latest period a firm can actually reconcile, which
                   -- is not the same as the latest period that exists.
                   --
                   -- GSTR-2B for month M is generated on the 14th of M+1, so
                   -- on 20 September a CA is working on August. A period row
                   -- appears as soon as any feed carries a date in it - two
                   -- bank value-dates spilling into September are enough -
                   -- and headlining that month showed 0.0% coverage and zero
                   -- exposure on the firm's landing screen, which reads as a
                   -- broken product rather than as a month that has not
                   -- started.
                   --
                   -- Falls back to the newest period for a client whose books
                   -- are loaded but whose first 2B has not arrived.
                   coalesce(
                       (select max(period) from periods p
                         where p.company_id = c.id
                           and p.gstr2b_generated_at is not null),
                       (select max(period) from periods p where p.company_id = c.id)
                   ) as latest
            from companies c
            join firms f on f.id = c.firm_id
            where c.firm_id = :firm_id
            order by c.name
            """
        ),
        {"firm_id": firm_id},
    ).all()

    out = []
    for company in companies:
        if company.latest is None:
            continue
        card = readiness(conn, company.id, company.latest)

        # Coverage is a property of the month being closed; exposure is not.
        # Credit that went unmatched in March is still unclaimed in September,
        # and a firm dashboard that only showed the current month would hide
        # exactly the ageing the Sec 16(4) clock runs against.
        book = conn.execute(
            text(
                """
                select count(*) filter (where status = 'open') as open_risks,
                       count(*) filter (where status = 'open' and severity = 'high')
                           as high_risks,
                       -- Open findings only, like the counts beside them.
                       -- Without the status filter a finding the CA had
                       -- already resolved still counted as exposure, and a
                       -- resolved one could set the statutory deadline shown
                       -- on the landing card.
                       coalesce(sum(headline_amount) filter (
                           where rule_code = 'R1' and status = 'open'
                       ), 0) as itc_at_risk,
                       -- The nearest statutory cut-off among the credit actually
                       -- at risk, and how much of it that cut-off governs. The
                       -- deadline is read from the finding, never recomputed by
                       -- the caller: two places deriving the same date is two
                       -- places for it to be wrong.
                       min(metrics ->> 'sec_16_4_deadline') filter (
                           where rule_code = 'R1' and status = 'open'
                       ) as next_deadline
                from risks where company_id = :cid
                """
            ),
            {"cid": company.id},
        ).one()

        before_deadline = conn.execute(
            text(
                """
                select coalesce(sum(headline_amount), 0) as amount, count(*) as findings
                from risks
                where company_id = :cid and rule_code = 'R1' and status = 'open'
                  and metrics ->> 'sec_16_4_deadline' = :deadline
                """
            ),
            {"cid": company.id, "deadline": book.next_deadline},
        ).one()

        out.append(
            {
                "company_id": str(company.id),
                "name": company.name,
                "gstin": company.gstin,
                "firm_name": company.firm_name,
                "period": company.latest,
                "gst_coverage_pct": card["gst_coverage_pct"],
                "bank_coverage_pct": card["bank_coverage_pct"],
                "open_risks": book.open_risks,
                "high_risks": book.high_risks,
                "itc_at_risk": book.itc_at_risk,
                "next_sec_16_4_deadline": book.next_deadline,
                "itc_before_next_deadline": before_deadline.amount,
                "findings_before_next_deadline": before_deadline.findings,
                "bank_variance": card["bank_variance"],
                "period_open_risks": card["open_risks"],
            }
        )
    return out


# ── company level ───────────────────────────────────────────────────────────


def company(conn: Connection, company_id: uuid.UUID) -> dict | None:
    row = conn.execute(
        text(
            "select c.id, c.name, c.gstin, c.pan, c.fy_start, f.name as firm_name "
            "from companies c join firms f on f.id = c.firm_id where c.id = :id"
        ),
        {"id": company_id},
    ).first()
    if row is None:
        return None
    return {
        "company_id": str(row.id),
        "name": row.name,
        "gstin": row.gstin,
        "pan": row.pan,
        "fy_start": row.fy_start,
        "firm_name": row.firm_name,
    }


def periods(conn: Connection, company_id: uuid.UUID) -> list[dict]:
    return [
        {
            "period": row.period,
            "status": row.status,
            "gstr2b_generated": row.gstr2b_generated_at is not None,
            "gstr3b_filed": row.gstr3b_filed,
            "gstr2b_stale": row.gstr2b_stale,
            "filing_frequency": row.filing_frequency,
            "open_risks": row.open_risks,
        }
        for row in conn.execute(
            text(
                """
                select p.period, p.status, p.gstr2b_generated_at, p.gstr3b_filed,
                       p.gstr2b_stale, p.filing_frequency,
                       (select count(*) from risks r
                         where r.company_id = p.company_id and r.period = p.period
                           and r.status = 'open') as open_risks
                from periods p where p.company_id = :cid order by p.period desc
                """
            ),
            {"cid": company_id},
        )
    ]


def readiness(conn: Connection, company_id: uuid.UUID, period: str) -> dict:
    """The financial readiness card (§13).

    Coverage and risk are two different polarities and are kept apart: 91%
    coverage is good and 58.8% concentration is not, and putting them on one
    visual scale invites exactly the misreading a CA cannot afford.
    """
    params = {"cid": company_id, "period": period}

    gst = conn.execute(
        text(
            """
            select count(*) filter (where status = 'matched') as matched,
                   count(*) as total
            from matches
            where company_id = :cid and period = :period and domain = 'gst'
              and left_type = 'purchase_invoice'
            """
        ),
        params,
    ).one()

    bank = conn.execute(
        text(
            """
            select count(*) filter (where status = 'matched') as matched,
                   count(*) as total
            from matches
            where company_id = :cid and period = :period and domain = 'bank'
              and left_type = 'bank_txn'
            """
        ),
        params,
    ).one()

    severity = {
        row.severity: row.count
        for row in conn.execute(
            text(
                "select severity, count(*) as count from risks "
                "where company_id = :cid and period = :period and status = 'open' "
                "group by severity"
            ),
            params,
        )
    }

    def headline(rule_code: str, column: str = "headline_amount") -> Decimal | None:
        value = conn.execute(
            text(
                f"select sum({column}) from risks where company_id = :cid "
                f"and period = :period and rule_code = :rule"
            ),
            {**params, "rule": rule_code},
        ).scalar()
        return value

    def single_pct(rule_code: str) -> Decimal | None:
        return conn.execute(
            text(
                "select headline_pct from risks where company_id = :cid "
                "and period = :period and rule_code = :rule limit 1"
            ),
            {**params, "rule": rule_code},
        ).scalar()

    open_risks = sum(severity.values())
    return {
        "period": period,
        "gst_coverage_pct": _pct(gst.matched, gst.total),
        "gst_matched": gst.matched,
        "gst_total": gst.total,
        "bank_coverage_pct": _pct(bank.matched, bank.total),
        "bank_matched": bank.matched,
        "bank_total": bank.total,
        "itc_at_risk": headline("R1") or ZERO,
        "itc_mismatch": headline("R2") or ZERO,
        "itc_reversal_37a": headline("R4") or ZERO,
        "bank_variance": headline("R5") or ZERO,
        "unidentified_deposits": headline("R6") or ZERO,
        "concentration_pct": single_pct("R7"),
        "receivables_aged_pct": single_pct("R8"),
        "open_risks": open_risks,
        "high_risks": severity.get("high", 0),
        "medium_risks": severity.get("medium", 0),
        "low_risks": severity.get("low", 0),
    }


# ── a span of months ────────────────────────────────────────────────────────
#
# Everything above answers for one period, because that is the unit GST works
# in: a return is filed for a month, a GSTR-2B is generated for a month. But
# "is this client getting better or worse", "how much credit have we lost this
# financial year" and "what did the last quarter cost" are the questions a
# partner actually asks, and not one of them is a question about August.


#: The rules whose headline amount is money that adds up across months. A
#: table rather than branches, so a new rule is a line here — and so the two
#: things that must agree, what is summed per month and what is summed into
#: the total, cannot be written out twice and drift.
_RANGE_MONEY = {
    "itc_at_risk": "R1",
    "itc_mismatch": "R2",
    "itc_reversal_37a": "R4",
    "bank_variance": "R5",
    "unidentified_deposits": "R6",
}


def _period_index(period: str) -> int:
    year, month = (int(part) for part in period.split("-"))
    return year * 12 + (month - 1)


def months_between(start: str, end: str) -> list[str]:
    """Every 'YYYY-MM' from start to end inclusive, oldest first.

    Generated rather than read back from the periods table on purpose: a month
    with no rows is a real answer to "what happened between April and August"
    — it means nothing was filed — and a range that silently skips it reports
    four months of work as though the fifth had never been asked about.
    """
    return [
        f"{value // 12:04d}-{value % 12 + 1:02d}"
        for value in range(_period_index(start), _period_index(end) + 1)
    ]


def period_range(conn: Connection, company_id: uuid.UUID, start: str, end: str) -> dict:
    """Readiness across a span of months, and what it comes to in total.

    The thing here that is easy to get wrong, and wrong in a way nobody would
    catch by looking: **coverage over a range is not the average of the
    monthly coverages.** A month with three purchase documents and a month
    with three thousand are not two equal opinions about how well this client
    reconciles, and averaging their percentages says they are. So the matched
    and total counts are summed first and the percentage is taken once from
    those sums — the same arithmetic `readiness()` does for a single month,
    over a bigger numerator and denominator rather than over a bag of
    percentages.

    Money is summed as `Decimal` by Postgres and handed on untouched. Nothing
    in this function puts a rupee through a float.
    """
    months = months_between(start, end)
    params = {"cid": company_id, "start": start, "end": end}

    gst = {
        row.period: row
        for row in conn.execute(
            text(
                """
                select period,
                       count(*) filter (where status = 'matched') as matched,
                       count(*) as total
                from matches
                where company_id = :cid and period between :start and :end
                  and domain = 'gst' and left_type = 'purchase_invoice'
                group by period
                """
            ),
            params,
        )
    }

    bank = {
        row.period: row
        for row in conn.execute(
            text(
                """
                select period,
                       count(*) filter (where status = 'matched') as matched,
                       count(*) as total
                from matches
                where company_id = :cid and period between :start and :end
                  and domain = 'bank' and left_type = 'bank_txn'
                group by period
                """
            ),
            params,
        )
    }

    severity: dict[str, dict[str, int]] = {}
    for row in conn.execute(
        text(
            """
            select period, severity, count(*) as count
            from risks
            where company_id = :cid and period between :start and :end
              and status = 'open'
            group by period, severity
            """
        ),
        params,
    ):
        severity.setdefault(row.period, {})[row.severity] = row.count

    # Headline amounts per rule per month. Unlike the counts above, this is
    # every finding regardless of status: an amount that was at risk in April
    # was at risk in April whether or not someone has since marked it
    # accepted, and a year-to-date total that moves when a finding is actioned
    # is a total nobody can reconcile against last week's copy of this page.
    money: dict[str, dict[str, Decimal]] = {}
    for row in conn.execute(
        text(
            """
            select period, rule_code, sum(headline_amount) as amount
            from risks
            where company_id = :cid and period between :start and :end
              and rule_code = any(:rules)
            group by period, rule_code
            """
        ),
        {**params, "rules": list(_RANGE_MONEY.values())},
    ):
        money.setdefault(row.period, {})[row.rule_code] = row.amount or ZERO

    filed = {
        row.period: row
        for row in conn.execute(
            text(
                """
                select period, status, gstr2b_generated_at, gstr3b_filed, gstr2b_stale
                from periods
                where company_id = :cid and period between :start and :end
                """
            ),
            params,
        )
    }

    rows: list[dict] = []
    for period in months:
        gst_row = gst.get(period)
        bank_row = bank.get(period)
        open_by_severity = severity.get(period, {})
        amounts = money.get(period, {})
        period_row = filed.get(period)

        gst_matched = gst_row.matched if gst_row else 0
        gst_total = gst_row.total if gst_row else 0
        bank_matched = bank_row.matched if bank_row else 0
        bank_total = bank_row.total if bank_row else 0

        rows.append(
            {
                "period": period,
                # A month with no `periods` row was never opened by any feed.
                # Reported as present-but-empty rather than dropped, because
                # in a range the gap is itself the finding.
                "present": period_row is not None,
                "status": period_row.status if period_row else None,
                "gstr2b_generated": bool(period_row and period_row.gstr2b_generated_at),
                "gstr3b_filed": bool(period_row and period_row.gstr3b_filed),
                "gstr2b_stale": bool(period_row and period_row.gstr2b_stale),
                "gst_matched": gst_matched,
                "gst_total": gst_total,
                "gst_coverage_pct": _pct(gst_matched, gst_total),
                "bank_matched": bank_matched,
                "bank_total": bank_total,
                "bank_coverage_pct": _pct(bank_matched, bank_total),
                "open_risks": sum(open_by_severity.values()),
                "high_risks": open_by_severity.get("high", 0),
                "medium_risks": open_by_severity.get("medium", 0),
                "low_risks": open_by_severity.get("low", 0),
                **{key: amounts.get(rule) or ZERO for key, rule in _RANGE_MONEY.items()},
            }
        )

    gst_matched = sum(row["gst_matched"] for row in rows)
    gst_total = sum(row["gst_total"] for row in rows)
    bank_matched = sum(row["bank_matched"] for row in rows)
    bank_total = sum(row["bank_total"] for row in rows)

    totals = {
        "months": len(rows),
        "months_with_data": sum(1 for row in rows if row["present"]),
        "months_reconciled": sum(1 for row in rows if row["gstr2b_generated"]),
        "gst_matched": gst_matched,
        "gst_total": gst_total,
        # Summed first, divided once. See the docstring.
        "gst_coverage_pct": _pct(gst_matched, gst_total),
        "bank_matched": bank_matched,
        "bank_total": bank_total,
        "bank_coverage_pct": _pct(bank_matched, bank_total),
        "open_risks": sum(row["open_risks"] for row in rows),
        "high_risks": sum(row["high_risks"] for row in rows),
        "medium_risks": sum(row["medium_risks"] for row in rows),
        "low_risks": sum(row["low_risks"] for row in rows),
        **{key: sum((row[key] for row in rows), ZERO) for key in _RANGE_MONEY},
    }

    return {"from": start, "to": end, "months": rows, "totals": totals}


def risks_in_range(
    conn: Connection,
    company_id: uuid.UUID,
    start: str,
    end: str,
    rule_code: str | None = None,
) -> list[dict]:
    """`risks()` over a span, with each finding carrying the month it is from.

    The period rides on every row because a list spanning five months is the
    one place a finding cannot be read without it: two identical R3 duplicates
    three months apart are the same sentence twice until the month tells them
    apart.

    Sorted by month first and severity second, rather than by severity across
    the whole span. A CA works a month at a time — the high findings of April
    are one piece of work and the high findings of July are another — and a
    list interleaving them is a list that cannot be worked down.
    """
    clause = "and r.rule_code = :rule" if rule_code else ""
    rows = conn.execute(
        text(
            f"""
            select r.id, r.period, r.rule_code, r.risk_key, r.severity, r.headline_amount,
                   r.headline_pct, r.calculation, r.rule_text, r.explanation,
                   r.status, r.metrics, ru.title, ru.domain,
                   (select count(*) from risk_evidence e where e.risk_id = r.id) as evidence
            from risks r
            join rules ru on ru.code = r.rule_code
            where r.company_id = :cid and r.period between :start and :end {clause}
            order by r.period desc, {_SEVERITY_ORDER}, r.headline_amount desc nulls last
            """
        ),
        {"cid": company_id, "start": start, "end": end, "rule": rule_code},
    ).all()

    return [
        {
            "risk_id": str(row.id),
            "period": row.period,
            "rule_code": row.rule_code,
            "title": row.title,
            "domain": row.domain,
            "risk_key": row.risk_key,
            "severity": row.severity,
            "headline_amount": row.headline_amount,
            "headline_pct": row.headline_pct,
            "calculation": row.calculation,
            "rule_text": row.rule_text,
            "explanation": row.explanation,
            "status": row.status,
            "metrics": row.metrics,
            "evidence_count": row.evidence,
        }
        for row in rows
    ]


# ── risks and evidence ──────────────────────────────────────────────────────────────────

_SEVERITY_ORDER = (
    "case severity when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end"
)


def risks(
    conn: Connection, company_id: uuid.UUID, period: str, rule_code: str | None = None
) -> list[dict]:
    clause = "and r.rule_code = :rule" if rule_code else ""
    rows = conn.execute(
        text(
            f"""
            select r.id, r.rule_code, r.risk_key, r.severity, r.headline_amount,
                   r.headline_pct, r.calculation, r.rule_text, r.explanation,
                   r.status, r.metrics, ru.title, ru.domain,
                   (select count(*) from risk_evidence e where e.risk_id = r.id) as evidence
            from risks r
            join rules ru on ru.code = r.rule_code
            where r.company_id = :cid and r.period = :period {clause}
            order by {_SEVERITY_ORDER}, r.headline_amount desc nulls last
            """
        ),
        {"cid": company_id, "period": period, "rule": rule_code},
    ).all()

    return [
        {
            "risk_id": str(row.id),
            "rule_code": row.rule_code,
            "title": row.title,
            "domain": row.domain,
            "risk_key": row.risk_key,
            "severity": row.severity,
            "headline_amount": row.headline_amount,
            "headline_pct": row.headline_pct,
            "calculation": row.calculation,
            "rule_text": row.rule_text,
            "explanation": row.explanation,
            "status": row.status,
            "metrics": row.metrics,
            "evidence_count": row.evidence,
        }
        for row in rows
    ]


@dataclass
class EvidenceItem:
    evidence_id: str
    record_type: str
    record_id: str
    document_id: str | None
    filename: str | None
    source_row: int | None
    note: str | None


@dataclass
class RiskDetail:
    risk: dict
    evidence: list[EvidenceItem] = field(default_factory=list)
    match: dict | None = None


def risk_detail(conn: Connection, risk_id: uuid.UUID) -> RiskDetail | None:
    row = conn.execute(
        text(
            """
            select r.id, r.company_id, r.period, r.rule_code, r.risk_key, r.severity,
                   r.headline_amount, r.headline_pct, r.calculation, r.rule_text,
                   r.explanation, r.status, r.metrics, r.computed_at,
                   ru.title, ru.domain, ru.thresholds, c.name as company_name
            from risks r
            join rules ru on ru.code = r.rule_code
            join companies c on c.id = r.company_id
            where r.id = :id
            """
        ),
        {"id": risk_id},
    ).first()
    if row is None:
        return None

    evidence = [
        EvidenceItem(
            evidence_id=str(item.id),
            record_type=item.record_type,
            record_id=str(item.record_id),
            document_id=str(item.document_id) if item.document_id else None,
            filename=item.filename,
            source_row=item.source_row,
            note=item.note,
        )
        for item in conn.execute(
            text(
                "select e.id, e.record_type, e.record_id, e.document_id, e.source_row, "
                "       e.note, d.filename "
                "from risk_evidence e left join documents d on d.id = e.document_id "
                "where e.risk_id = :id order by e.id"
            ),
            {"id": risk_id},
        )
    ]

    detail = RiskDetail(
        risk={
            "risk_id": str(row.id),
            "company_id": str(row.company_id),
            "company_name": row.company_name,
            "period": row.period,
            "rule_code": row.rule_code,
            "title": row.title,
            "domain": row.domain,
            "severity": row.severity,
            "headline_amount": row.headline_amount,
            "headline_pct": row.headline_pct,
            "calculation": row.calculation,
            "rule_text": row.rule_text,
            "explanation": row.explanation,
            "status": row.status,
            "metrics": row.metrics,
            "thresholds": row.thresholds,
            "computed_at": row.computed_at,
        },
        evidence=evidence,
    )

    # The scoring breakdown behind the evidence card, where one exists.
    record_ids = [item.record_id for item in evidence if item.record_type == "purchase_invoice"]
    if record_ids:
        match = conn.execute(
            text(
                "select match_score, match_method, status, score_breakdown, "
                "       amount_delta, date_delta_days "
                "from matches where company_id = :cid and left_id = cast(:rid as uuid) "
                "and domain = 'gst' limit 1"
            ),
            {"cid": row.company_id, "rid": record_ids[0]},
        ).first()
        if match is not None:
            detail.match = {
                "match_score": match.match_score,
                "match_method": match.match_method,
                "status": match.status,
                "score_breakdown": match.score_breakdown,
                "amount_delta": match.amount_delta,
                "date_delta_days": match.date_delta_days,
            }

    return detail


def evidence_source(conn: Connection, evidence_id: uuid.UUID, context: int = 2) -> dict | None:
    """Open the stored file and return the exact line the evidence points at.

    This is the moment the demo becomes real: a figure on a dashboard, one
    click, and the raw file row that produced it — not a log entry claiming it
    happened.
    """
    row = conn.execute(
        text(
            "select e.source_row, d.filename, d.storage_key, d.kind, d.sha256 "
            "from risk_evidence e join documents d on d.id = e.document_id "
            "where e.id = :id"
        ),
        {"id": evidence_id},
    ).first()
    if row is None or row.source_row is None:
        return None

    # Text, not a path: the deployed object store is S3 and has no local
    # path to stat. `exists` is asked separately so a document that has gone
    # missing reads as exactly that, rather than as a stack trace.
    if not storage.exists(row.storage_key):
        return {
            "filename": row.filename,
            "source_row": row.source_row,
            "error": "stored document is missing from the object store",
        }
    body = storage.read_text(row.storage_key)

    if row.kind in ("gstr2b", "ims"):
        return _json_entry(body, row, context)
    return _csv_line(body, row, context)


def _csv_line(body: str, row, context: int) -> dict:
    lines = body.splitlines()
    index = row.source_row - 1
    start = max(0, index - context)
    end = min(len(lines), index + context + 1)
    return {
        "filename": row.filename,
        "sha256": row.sha256,
        "kind": row.kind,
        "source_row": row.source_row,
        "header": lines[0] if lines else "",
        "line": lines[index] if 0 <= index < len(lines) else "",
        "context": [
            {"row": number + 1, "text": lines[number], "is_target": number == index}
            for number in range(start, end)
        ],
    }


def _json_entry(body: str, row, context: int) -> dict:
    """The 2B or IMS entry a piece of evidence points at.

    `source_row` is a position in the statement's canonical reading order, so
    this walks the same order the ingester did rather than rebuilding an
    index of its own. It used to reconstruct only the `b2b` list, which meant
    every credit note, ISD document and import returned an empty source with
    a 200 — and on a smaller B2B block, the wrong invoice entirely.
    """
    import json

    payload = json.loads(body)

    if row.kind == "ims":
        # The IMS export is a flat list of records, numbered in file order.
        entries = [dict(record) for record in payload.get("records", [])]
    else:
        entries = [describe(shape, block, entry) for shape, block, entry in iter_entries(payload)]

    index = row.source_row - 1
    start = max(0, index - context)
    end = min(len(entries), index + context + 1)

    if not 0 <= index < len(entries):
        # The stored document no longer contains that position. Say so rather
        # than rendering a blank card that looks like an answer.
        return {
            "filename": row.filename,
            "sha256": row.sha256,
            "kind": row.kind,
            "source_row": row.source_row,
            "line": "",
            "context": [],
            "error": (
                f"{row.filename} holds {len(entries)} entries, so there is no row "
                f"{row.source_row}. Re-ingest this document."
            ),
        }

    return {
        "filename": row.filename,
        "sha256": row.sha256,
        "kind": row.kind,
        "source_row": row.source_row,
        "line": json.dumps(entries[index]),
        "context": [
            {"row": number + 1, "text": json.dumps(entries[number]), "is_target": number == index}
            for number in range(start, end)
        ],
    }


# ── the 2B sections the purchase register was never going to match ──────────

#: What each non-B2B section of GSTR-2B actually is, in the words a CA uses.
#: B2B and B2BA are absent on purpose: those are the sections the purchase
#: register is reconciled against, and they are reported as coverage, not as
#: a residue.
OTHER_ITC_LABELS: dict[str, str] = {
    "CDNR": "Credit and debit notes",
    "CDNRA": "Credit and debit notes, amended",
    "ISD": "Input service distributor",
    "ISDA": "Input service distributor, amended",
    "IMPG": "Imports of goods",
    "IMPGSEZ": "Imports from an SEZ unit",
    "ECO": "Supplies through an e-commerce operator",
    "ECOA": "E-commerce supplies, amended",
    "ITC_REVERSED": "Credit reversed",
    # Comma-separated so `_other_itc_label` can keep the qualifier when it
    # replaces the head with the note's direction.
    "B2B_DNR": "Notes, supplier not registered",
}


#: A note section splits into two rows, one per direction, and they are not
#: the same fact. "Credit and debit notes" printed on both of them left two
#: visually identical rows whose only difference was an amount — and the
#: summary total now subtracts one of them and adds the other, which a reader
#: cannot verify against rows that do not say which is which.
_NOTE_LABELS = {"C": "Credit notes", "D": "Debit notes"}


def _other_itc_label(section: str, note_type: str | None) -> str:
    base = OTHER_ITC_LABELS.get(section, section)
    if note_type is None:
        return base
    direction = _NOTE_LABELS.get(note_type)
    if direction is None:
        return base
    # Amendments keep their qualifier: "Credit notes, amended".
    suffix = base.split(",", 1)[1] if "," in base else ""
    return f"{direction},{suffix}" if suffix else direction


def other_itc(conn: Connection, company_id: uuid.UUID, period: str) -> dict:
    """The parts of GSTR-2B a purchase-register match will never explain.

    Modelling 2B as one flat list of invoices is the mistake this function
    exists to make visible. A CA who reconciles only the B2B table and then
    wonders why their claimable credit disagrees with the portal is looking
    at a credit note, an ISD distribution or a bill of entry that the
    register never contained and never could.

    Credit notes reduce claimable credit and debit notes increase it, so the
    net adjustment is signed. The stored values stay positive and match the
    file — the drill-down shows the figure beside the line it came from, and
    the two have to agree — so the sign is applied here, once, where the
    aggregate is taken.
    """
    rows = conn.execute(
        text(
            """
            select section,
                   note_type,
                   count(*)                                as documents,
                   sum(taxable_value)                      as taxable,
                   sum(cgst + sgst + igst + cess)          as tax
            from gstr2b_lines
            where company_id = :cid
              and period = :period
              and section not in ('B2B', 'B2BA')
            group by section, note_type
            order by section, note_type
            """
        ),
        {"cid": company_id, "period": period},
    ).all()

    groups = [
        {
            "section": row.section,
            "label": _other_itc_label(row.section, row.note_type),
            "note_type": row.note_type,
            "documents": row.documents,
            "taxable": row.taxable or Decimal("0.00"),
            "tax": row.tax or Decimal("0.00"),
        }
        for row in rows
    ]

    # One pass, two totals, and the sign applied in exactly one place.
    #
    # `claimable_tax` is what these sections do to the claim taken together:
    # a credit note reduces it, a debit note increases it, everything else
    # adds. It is computed here rather than by whatever is displaying it,
    # because an unsigned sum of the same rows OVERSTATES the credit
    # available — and overstating credit is the one direction of error that
    # costs a client money at assessment rather than only time.
    #
    # The interface used to sum the group rows itself and got exactly that
    # wrong: on the seeded August it showed Rs 3.18 L where the answer is
    # Rs 3.15 L, over by twice the credit-note tax. The fix is not a
    # better sum in the view; it is that the view does not sum.
    net = Decimal("0.00")
    claimable = Decimal("0.00")
    for group in groups:
        if group["note_type"] == "C":
            net -= group["tax"]
            claimable -= group["tax"]
        elif group["note_type"] == "D":
            net += group["tax"]
            claimable += group["tax"]
        else:
            claimable += group["tax"]

    return {
        "period": period,
        "groups": groups,
        "net_note_adjustment": net,
        "claimable_tax": claimable,
    }


# ── IMS ─────────────────────────────────────────────────────────────────────


def ims_summary(conn: Connection, company_id: uuid.UUID, period: str) -> dict | None:
    """The Invoice Management System dashboard, reduced to the decision.

    IMS went live in October 2024 and changed the default: a record nobody
    touches is *deemed accepted* when GSTR-3B is filed. Inaction is now an
    action, which is why `deemed_accepted_value` is on this summary at all —
    it is the rupee value a firm is about to accept by doing nothing.

    Returns None when the period has no IMS records, which is an ordinary
    state (the feed predates October 2024, or the domain is switched off)
    rather than an error.

    Counted in one pass with filtered aggregates rather than by joining the
    table to itself once per bucket: the counts have to add up to `total`,
    and separate queries against a table that changes underneath them do not
    have to.
    """
    row = conn.execute(
        text(
            """
            select count(*)                                                as total,
                   count(*) filter (where recommended_action = 'accept')   as accept,
                   count(*) filter (where recommended_action = 'reject')   as reject,
                   count(*) filter (where recommended_action = 'pending')  as pending,
                   count(*) filter (where recommended_action is null)      as decide,
                   count(*) filter (where not supplier_filed)              as not_filed,
                   count(*) filter (where deemed_accepted)                 as deemed_accepted,
                   coalesce(sum(total_value) filter (where deemed_accepted), 0)
                                                                  as deemed_accepted_value,
                   count(*) filter (
                       where recommended_action = 'reject'
                         and reject_raises_supplier_liability
                   )                                                as reject_raises_liability,
                   count(*) filter (where not pending_allowed)      as pending_barred
            from ims_records
            where company_id = :cid and period = :period
            """
        ),
        {"cid": company_id, "period": period},
    ).one()

    if row.total == 0:
        return None

    return {
        "period": period,
        "total": row.total,
        "accept": row.accept,
        "reject": row.reject,
        "pending": row.pending,
        "decide": row.decide,
        "not_filed": row.not_filed,
        "deemed_accepted": row.deemed_accepted,
        "deemed_accepted_value": row.deemed_accepted_value,
        "reject_raises_liability": row.reject_raises_liability,
        "pending_barred": row.pending_barred,
    }
