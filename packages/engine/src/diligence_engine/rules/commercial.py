"""Domain C — commercial. The diligence hook.

R7  CUSTOMER_CONCENTRATION  how much of revenue sits with the top three
R8  RECEIVABLES_AGEING      how much of what is owed has gone stale

These are the first two questions any lender asks, which is why they sit in
the product from month one rather than being bolted on when the diligence
package is generated.

R8 ages invoices by FIFO allocation: receipts from a customer clear that
customer's oldest open invoice first. That is how a ledger actually behaves,
and it is the difference between "this customer owes 40 lakh" and "this
customer has owed 12 lakh of it since March".
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.normalise import format_inr
from diligence_engine.rules.base import Evidence, RiskDraft, RuleSpec

ZERO = Decimal("0.00")


def _period_end(period: str) -> date:
    year, month = (int(part) for part in period.split("-"))
    first_next = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return first_next - timedelta(days=1)


def rule_r7_concentration(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    rows = conn.execute(
        text(
            """
            select coalesce(p.canonical_name, le.ledger_name) as customer,
                   le.party_id,
                   sum(le.debit) as revenue
            from ledger_entries le
            left join parties p on p.id = le.party_id
            where le.company_id = :company_id
              and le.period = :period
              and le.voucher_type = 'Sales'
            group by 1, 2
            order by revenue desc
            """
        ),
        {"company_id": company_id, "period": period},
    ).all()

    if not rows:
        return []

    total = sum((row.revenue for row in rows), ZERO)
    if total <= 0:
        return []

    top_n = int(spec.thresholds.get("top_n", 3))
    medium = Decimal(str(spec.thresholds.get("medium_pct", 50)))
    high = Decimal(str(spec.thresholds.get("high_pct", 65)))

    top = rows[:top_n]
    top_revenue = sum((row.revenue for row in top), ZERO)
    share = (top_revenue / total * 100).quantize(Decimal("0.01"))

    if share <= medium:
        return []

    severity = "high" if share > high else "medium"
    return [
        RiskDraft(
            rule_code="R7",
            risk_key="R7:customer_concentration",
            severity=severity,
            headline_amount=top_revenue,
            headline_pct=share,
            metrics={
                "top_n": top_n,
                "top_customers": [{"name": row.customer, "revenue": row.revenue} for row in top],
                "top_revenue": top_revenue,
                "total_revenue": total,
                "share_pct": share,
                "medium_threshold_pct": medium,
                "high_threshold_pct": high,
                "customer_count": len(rows),
            },
            calculation=f"{format_inr(top_revenue)} / {format_inr(total)} = {share}%",
            rule_text=(
                f"Top {top_n} customers exceed {medium}% of the period's revenue "
                f"({high}% is high severity)."
            ),
            evidence=[
                Evidence(
                    record_type="party",
                    record_id=row.party_id,
                    note=f"{row.customer}: {format_inr(row.revenue)} this period",
                )
                for row in top
                if row.party_id is not None
            ],
        )
    ]


def rule_r8_receivables_ageing(
    conn: Connection, company_id: uuid.UUID, period: str, spec: RuleSpec
) -> list[RiskDraft]:
    """FIFO-allocate receipts against sales, then age what is still open."""
    as_of = _period_end(period)
    bucket_days = int(spec.thresholds.get("bucket_days", 90))
    pct_threshold = Decimal(str(spec.thresholds.get("pct_of_total", 20)))

    rows = conn.execute(
        text(
            """
            select party_id, voucher_type, entry_date, debit, credit, id
            from ledger_entries
            where company_id = :company_id
              and voucher_type in ('Sales', 'Receipt')
              and entry_date <= :as_of
              and party_id is not null
            order by party_id, entry_date, id
            """
        ),
        {"company_id": company_id, "as_of": as_of},
    ).all()

    open_by_party: dict[uuid.UUID, list[tuple[date, Decimal]]] = {}
    receipts: dict[uuid.UUID, Decimal] = {}
    for row in rows:
        if row.voucher_type == "Sales" and row.debit:
            open_by_party.setdefault(row.party_id, []).append((row.entry_date, row.debit))
        elif row.voucher_type == "Receipt" and row.credit:
            receipts[row.party_id] = receipts.get(row.party_id, ZERO) + row.credit

    total_open = ZERO
    aged_open = ZERO
    aged_parties: list[tuple[uuid.UUID, Decimal]] = []

    for party_id, invoices in open_by_party.items():
        remaining = receipts.get(party_id, ZERO)
        party_aged = ZERO
        for invoice_date, amount in invoices:
            if remaining >= amount:
                remaining -= amount
                continue
            open_amount = amount - remaining
            remaining = ZERO
            total_open += open_amount
            if (as_of - invoice_date).days > bucket_days:
                aged_open += open_amount
                party_aged += open_amount
        if party_aged > 0:
            aged_parties.append((party_id, party_aged))

    if total_open <= 0:
        return []

    share = (aged_open / total_open * 100).quantize(Decimal("0.01"))
    if share <= pct_threshold:
        return []

    aged_parties.sort(key=lambda item: item[1], reverse=True)
    names = {
        row.id: row.canonical_name
        for row in conn.execute(
            text("select id, canonical_name from parties where company_id = :company_id"),
            {"company_id": company_id},
        )
    }

    return [
        RiskDraft(
            rule_code="R8",
            risk_key="R8:receivables_ageing",
            severity="high" if share > pct_threshold * 2 else "medium",
            headline_amount=aged_open,
            headline_pct=share,
            metrics={
                "as_of": as_of,
                "bucket_days": bucket_days,
                "total_receivables": total_open,
                "aged_receivables": aged_open,
                "aged_share_pct": share,
                "worst_parties": [
                    {"name": names.get(party_id, "unknown"), "aged": amount}
                    for party_id, amount in aged_parties[:5]
                ],
            },
            calculation=(
                f"{format_inr(aged_open)} over {bucket_days} days / "
                f"{format_inr(total_open)} total = {share}%"
            ),
            rule_text=(
                f"Receivables older than {bucket_days} days exceed {pct_threshold}% of the "
                f"total outstanding, allocated FIFO as of {as_of:%d %b %Y}."
            ),
            evidence=[
                Evidence(
                    record_type="party",
                    record_id=party_id,
                    note=f"{names.get(party_id, 'unknown')}: {format_inr(amount)} aged",
                )
                for party_id, amount in aged_parties[:5]
            ],
        )
    ]
